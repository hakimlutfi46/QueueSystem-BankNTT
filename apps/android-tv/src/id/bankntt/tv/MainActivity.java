package id.bankntt.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Full-screen queue display for Android TV. Finds the server on the LAN, registers itself as a TV
 * (approved by the admin in Admin → Perangkat) and keeps /display open. BACK or MENU on the remote
 * opens the menu (reload, change server, autostart permission, close).
 */
public class MainActivity extends Activity {
    private static final long RETRY_MS = 10_000;
    /** The queue pages are built for Chrome 111+ (Next.js default); an older WebView cannot run them. */
    private static final int MIN_WEBVIEW = 111;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable retry = this::connect;

    private SharedPreferences prefs;
    private WebView web;
    private View overlay;
    private TextView status;
    private Button updateWebView;
    private View codeRow;
    private EditText codeInput;
    private WifiManager.MulticastLock multicastLock;

    private boolean connecting;
    private boolean pageFailed;
    private boolean choosing;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("bankntt-tv", Context.MODE_PRIVATE);
        if (prefs.getString("installId", "").isEmpty()) {
            prefs.edit().putString("installId", UUID.randomUUID().toString()).apply();
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = createWebView();
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay = createOverlay();
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        hideSystemBars();

        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicastLock = wifi.createMulticastLock("bankntt-discovery");
            multicastLock.setReferenceCounted(false);
        }
        connect();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        web.onResume();
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        worker.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_MENU) {
            if (event.getAction() == KeyEvent.ACTION_UP) showMenu();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    /* ------------------------------------------------------------------ views */

    private WebView createWebView() {
        WebView view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Calls are announced without anyone touching the TV.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        CookieManager.getInstance().setAcceptCookie(true);
        view.setBackgroundColor(Color.WHITE);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return false;
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                pageFailed = false;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (pageFailed || "about:blank".equals(url)) return;
                overlay.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                handleDeviceRequired(url);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (Build.VERSION.SDK_INT >= 23 && request.isForMainFrame()) pageUnreachable();
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView v, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < 23) pageUnreachable();
            }
        });
        return view;
    }

    private View createOverlay() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(48), dp(32), dp(48), dp(32));

        int bannerId = getResources().getIdentifier("banner", "drawable", getPackageName());
        if (bannerId != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(bannerId);
            box.addView(logo, new LinearLayout.LayoutParams(dp(240), dp(135)));
        }
        TextView title = new TextView(this);
        title.setText("BANK NTT TV");
        title.setTextColor(Color.rgb(0, 51, 102));
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        status = new TextView(this);
        status.setTextColor(Color.DKGRAY);
        status.setTextSize(18);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(16), 0, dp(24));
        box.addView(status);

        LinearLayout code = new LinearLayout(this);
        code.setGravity(Gravity.CENTER);
        code.setPadding(0, 0, 0, dp(16));
        codeInput = new EditText(this);
        codeInput.setHint("XXX-XXX");
        codeInput.setTextSize(30);
        codeInput.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        codeInput.setGravity(Gravity.CENTER);
        codeInput.setSingleLine(true);
        codeInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        codeInput.setImeOptions(EditorInfo.IME_ACTION_DONE);
        codeInput.setFilters(new InputFilter[] { new InputFilter.LengthFilter(7), new InputFilter.AllCaps() });
        codeInput.setOnEditorActionListener((v, actionId, event) -> {
            submitCode();
            return true;
        });
        code.addView(codeInput, new LinearLayout.LayoutParams(dp(260), ViewGroup.LayoutParams.WRAP_CONTENT));
        code.addView(button("Pasang", v -> submitCode()));
        code.addView(button("Tanpa kode (tunggu persetujuan)", v -> pairWith("")));
        code.setVisibility(View.GONE);
        codeRow = code;
        box.addView(code);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.CENTER);
        Button again = button("Coba lagi", v -> connectNow());
        Button manual = button("Masukkan alamat server", v -> askAddress());
        updateWebView = button("Perbarui WebView", v -> openWebViewStore());
        updateWebView.setVisibility(View.GONE);
        buttons.addView(updateWebView);
        buttons.addView(again);
        buttons.addView(manual);
        box.addView(buttons);

        TextView hint = new TextView(this);
        hint.setText("Tombol Kembali atau Menu pada remote membuka menu.");
        hint.setTextColor(Color.GRAY);
        hint.setTextSize(14);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(24), 0, 0);
        box.addView(hint);
        return box;
    }

    private Button button(String text, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setFocusable(true);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(8), 0, dp(8), 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void showStatus(String text) {
        codeRow.setVisibility(View.GONE);
        status.setText(text);
        overlay.setVisibility(View.VISIBLE);
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /* ------------------------------------------------------------- connecting */

    private void connectNow() {
        main.removeCallbacks(retry);
        connect();
    }

    private void scheduleRetry(long ms) {
        main.removeCallbacks(retry);
        main.postDelayed(retry, ms);
    }

    /**
     * Saved server healthy -> open it. Otherwise scan the LAN: the saved server at a new address
     * (same announced name) is adopted with its token; without a saved server one result is used
     * directly and several are offered in a list.
     */
    private void connect() {
        if (connecting || choosing) return;
        int webViewVersion = webViewVersion();
        if (webViewVersion > 0 && webViewVersion < MIN_WEBVIEW) {
            updateWebView.setVisibility(View.VISIBLE);
            updateWebView.requestFocus();
            showStatus("Mesin browser TV ini terlalu lama (Android System WebView versi " + webViewVersion + ").\n"
                + "Layar antrian butuh versi " + MIN_WEBVIEW + " atau lebih baru.\n"
                + "Pilih Perbarui WebView, perbarui lewat Play Store, lalu pilih Coba lagi.");
            return;
        }
        updateWebView.setVisibility(View.GONE);
        connecting = true;
        main.removeCallbacks(retry);
        final String saved = prefs.getString("server", "");
        final String savedName = prefs.getString("serverName", "");
        showStatus(saved.isEmpty() ? "Mencari server antrian di jaringan…" : "Menghubungkan ke " + saved + " …");
        worker.execute(() -> {
            if (!saved.isEmpty() && ServerApi.health(saved)) {
                main.post(() -> {
                    connecting = false;
                    openServer();
                });
                return;
            }
            List<ServerApi.Found> found = scan();
            main.post(() -> {
                connecting = false;
                if (!saved.isEmpty()) {
                    for (ServerApi.Found server : found) {
                        if (!savedName.isEmpty() && server.name.equals(savedName)) {
                            prefs.edit().putString("server", server.url).apply();
                            openServer();
                            return;
                        }
                    }
                    showStatus("Server " + (savedName.isEmpty() ? saved : savedName + " (" + saved + ")")
                        + " belum dapat dihubungi.\nPastikan PC server menyala dan TV tersambung ke jaringan yang sama.\nMencoba lagi otomatis…");
                    scheduleRetry(RETRY_MS);
                    return;
                }
                if (found.isEmpty()) {
                    showStatus("Server antrian belum ditemukan.\nPastikan PC server menyala dan TV tersambung ke WiFi/LAN yang sama.\nMencoba lagi otomatis…");
                    scheduleRetry(RETRY_MS);
                } else if (found.size() == 1) {
                    useServer(found.get(0).url, found.get(0).name);
                } else {
                    chooseServer(found);
                }
            });
        });
    }

    /** Chrome major version of the system WebView, from its user agent; 0 when unknown. */
    private int webViewVersion() {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(WebSettings.getDefaultUserAgent(this));
            return m.find() ? Integer.parseInt(m.group(1)) : 0;
        } catch (RuntimeException unknown) {
            return 0;
        }
    }

    private void openWebViewStore() {
        String id = "com.google.android.webview";
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)));
        } catch (RuntimeException noStore) {
            Toast.makeText(this, "Play Store tidak tersedia. Perbarui Android System WebView lewat Pengaturan → Aplikasi, atau minta bantuan teknisi.", Toast.LENGTH_LONG).show();
        }
    }

    private List<ServerApi.Found> scan() {
        if (multicastLock != null) multicastLock.acquire();
        try {
            return ServerApi.discover();
        } finally {
            if (multicastLock != null) multicastLock.release();
        }
    }

    private void chooseServer(final List<ServerApi.Found> servers) {
        choosing = true;
        String[] labels = new String[servers.size()];
        for (int i = 0; i < servers.size(); i++) labels[i] = servers.get(i).name + "  —  " + servers.get(i).url;
        new AlertDialog.Builder(this)
            .setTitle("Pilih server antrian")
            .setItems(labels, (d, which) -> {
                choosing = false;
                useServer(servers.get(which).url, servers.get(which).name);
            })
            .setOnCancelListener(d -> {
                choosing = false;
                scheduleRetry(RETRY_MS);
            })
            .show();
    }

    /** A different server: forget the old token and register again. */
    private void useServer(String url, String name) {
        boolean same = url.equals(prefs.getString("server", ""));
        SharedPreferences.Editor edit = prefs.edit().putString("server", url).putString("serverName", name);
        if (!same) edit.remove("token");
        edit.apply();
        openServer();
    }

    private void openServer() {
        if (prefs.getString("token", "").isEmpty()) showCodeEntry(null);
        else loadDisplay();
    }

    /** Asks for the code from Admin → Perangkat → Kode aplikasi (6 characters, valid 30 minutes). */
    private void showCodeEntry(String note) {
        String server = prefs.getString("server", "");
        String name = prefs.getString("serverName", "");
        showStatus((note == null ? "" : note + "\n\n")
            + "Server: " + (name.isEmpty() ? server : name + " (" + server + ")") + "\n"
            + "Di Admin → Perangkat, daftarkan Layar TV lalu tekan Kode aplikasi.\n"
            + "Ketik kode 6 karakternya di bawah ini, lalu pilih Pasang.");
        codeRow.setVisibility(View.VISIBLE);
        codeInput.requestFocus();
    }

    private void submitCode() {
        String code = ServerApi.normalizeCode(codeInput.getText().toString());
        if (code == null) {
            Toast.makeText(this, "Kode harus 6 karakter, misalnya 4K7-Q2M.", Toast.LENGTH_LONG).show();
            codeInput.requestFocus();
            return;
        }
        pairWith(code);
    }

    /** With a code the TV is approved at once; without one it waits for Setujui in Admin → Perangkat. */
    private void pairWith(final String code) {
        final String server = prefs.getString("server", "");
        final String name = deviceName();
        final String installId = prefs.getString("installId", "");
        InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(codeInput.getWindowToken(), 0);
        codeInput.clearFocus();
        showStatus("Memasangkan TV ke server…");
        worker.execute(() -> {
            final ServerApi.PairResult result = ServerApi.pair(server, installId, name, code);
            main.post(() -> {
                if (!server.equals(prefs.getString("server", ""))) return;
                if (result.ok) {
                    codeInput.setText("");
                    prefs.edit().putString("token", result.token).apply();
                    loadDisplay();
                    askAutostartOnce();
                } else if ("UNREACHABLE".equals(result.code)) {
                    showStatus(result.message + "\nMencoba lagi otomatis…");
                    scheduleRetry(RETRY_MS);
                } else {
                    showCodeEntry(result.message);
                }
            });
        });
    }

    private String deviceName() {
        String model = (Build.MODEL == null ? "" : Build.MODEL).replaceAll("[^\\w.-]", "");
        if (model.length() > 40) model = model.substring(0, 40);
        return model.isEmpty() ? "Layar TV" : "Layar TV (" + model + ")";
    }

    private void loadDisplay() {
        String server = prefs.getString("server", "");
        String token = prefs.getString("token", "");
        showStatus("Membuka layar antrian…");
        web.loadUrl(server + "/display" + (token.isEmpty() ? "" : "?token=" + Uri.encode(token)));
    }

    private void pageUnreachable() {
        pageFailed = true;
        showStatus("Server tidak dapat dihubungi.\nMencoba lagi otomatis…");
        scheduleRetry(RETRY_MS);
    }

    /**
     * /device-required?state=pending|limited re-checks by itself. Revoked, or a token the server no
     * longer knows (for example after a data reset): ask for a new code.
     */
    private void handleDeviceRequired(String url) {
        Uri uri = Uri.parse(url);
        String server = prefs.getString("server", "");
        if (!url.startsWith(server) || !"/device-required".equals(uri.getPath())) return;
        String state = uri.getQueryParameter("state");
        if ("revoked".equals(state)) {
            prefs.edit().remove("token").apply();
            showCodeEntry("TV ini dicabut oleh admin. Buat kode baru untuk memasangnya lagi.");
        } else if ("unknown".equals(state)) {
            prefs.edit().remove("token").apply();
            showCodeEntry("Server tidak mengenali TV ini lagi (misalnya data server di-reset).");
        }
    }

    /* ------------------------------------------------------------------- menu */

    private void showMenu() {
        final List<String> labels = new ArrayList<>();
        final List<Runnable> actions = new ArrayList<>();
        labels.add("Muat ulang layar");
        actions.add(() -> {
            if (prefs.getString("token", "").isEmpty()) connectNow();
            else loadDisplay();
        });
        if (!prefs.getString("server", "").isEmpty()) {
            labels.add("Pasang ulang dengan kode");
            actions.add(() -> {
                prefs.edit().remove("token").apply();
                web.loadUrl("about:blank");
                showCodeEntry(null);
            });
        }
        labels.add("Cari server lagi");
        actions.add(() -> {
            prefs.edit().remove("server").remove("serverName").apply();
            connectNow();
        });
        labels.add("Masukkan alamat server");
        actions.add(this::askAddress);
        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(this)) {
            labels.add("Izinkan buka otomatis saat TV menyala");
            actions.add(this::askOverlayPermission);
        }
        labels.add("Tutup aplikasi");
        actions.add(this::finish);
        String server = prefs.getString("server", "");
        new AlertDialog.Builder(this)
            .setTitle(server.isEmpty() ? "BANK NTT TV" : "BANK NTT TV — " + server)
            .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
            .setNegativeButton("Batal", null)
            .show();
    }

    private void askAddress() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        String saved = prefs.getString("server", "");
        input.setText(saved.isEmpty() ? "192.168.1." : saved.replaceFirst("^http://", ""));
        input.setSelection(input.getText().length());
        new AlertDialog.Builder(this)
            .setTitle("Alamat PC server")
            .setMessage("Contoh: 192.168.1.53 atau 192.168.1.53:3000")
            .setView(input)
            .setPositiveButton("Sambungkan", (d, w) -> {
                final String url = normalizeAddress(input.getText().toString());
                if (url == null) {
                    Toast.makeText(this, "Alamat tidak valid.", Toast.LENGTH_LONG).show();
                    return;
                }
                showStatus("Memeriksa " + url + " …");
                worker.execute(() -> {
                    boolean ok = ServerApi.health(url);
                    main.post(() -> {
                        if (ok) useServer(url, "");
                        else {
                            showStatus("Server " + url + " tidak menjawab.\nPeriksa alamatnya, lalu coba lagi.");
                            scheduleRetry(RETRY_MS);
                        }
                    });
                });
            })
            .setNegativeButton("Batal", null)
            .show();
    }

    static String normalizeAddress(String text) {
        String value = text == null ? "" : text.trim().replaceFirst("^(?i)https?://", "");
        int slash = value.indexOf('/');
        if (slash >= 0) value = value.substring(0, slash);
        if (!value.matches("[A-Za-z0-9.-]+(:\\d{1,5})?")) return null;
        if (!value.contains(":")) value += ":3000";
        return "http://" + value;
    }

    /** Android 10+: opening by itself after the TV starts needs "display over other apps". Asked once. */
    private void askAutostartOnce() {
        if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this) || prefs.getBoolean("autostartAsked", false)) return;
        prefs.edit().putBoolean("autostartAsked", true).apply();
        new AlertDialog.Builder(this)
            .setTitle("Buka otomatis saat TV menyala")
            .setMessage("Supaya layar antrian terbuka sendiri setiap TV dinyalakan, izinkan BANK NTT TV "
                + "\"tampil di atas aplikasi lain\" pada layar berikutnya, lalu tekan Kembali.\n\n"
                + "Bisa juga nanti lewat menu (tombol Kembali pada remote).")
            .setPositiveButton("Izinkan", (d, w) -> askOverlayPermission())
            .setNegativeButton("Nanti", null)
            .show();
    }

    private void askOverlayPermission() {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (RuntimeException notOnThisTv) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
            } catch (RuntimeException none) {
                Toast.makeText(this, "Buka Pengaturan → Aplikasi → BANK NTT TV → Tampilkan di atas aplikasi lain.", Toast.LENGTH_LONG).show();
            }
        }
    }
}
