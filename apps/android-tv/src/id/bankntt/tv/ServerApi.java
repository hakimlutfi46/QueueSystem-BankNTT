package id.bankntt.tv;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.json.JSONObject;

/**
 * Network calls to the queue server. Blocking: call from a background thread.
 *
 * Discovery (same contract as the Windows apps):
 *   TV     -> UDP <broadcast>:41234  {"type":"bankntt-discover","v":1}
 *   server -> UDP unicast reply      {"type":"bankntt-server","v":1,"name","port","version"}
 * Each reply is confirmed with GET http://<sender>:<port>/api/health -> {"ok":true}.
 *
 * Pairing: POST /api/devices/pair {code, installId} with the code from Admin → Perangkat → Kode aplikasi
 * (approved at once), or {kind:"display", name, installId} without one (waits for approval).
 *   -> {token, kind, name, approved}
 */
final class ServerApi {
    static final int DISCOVERY_PORT = 41234;
    private static final int SCAN_MS = 4000;
    private static final int TIMEOUT_MS = 5000;

    private ServerApi() {}

    static final class Found {
        final String name;
        final String url;

        Found(String name, String url) {
            this.name = name;
            this.url = url;
        }
    }

    static final class PairResult {
        boolean ok;
        String token = "";
        String name = "";
        boolean approved;
        String code = ""; // DEVICE_REVOKED, RATE_LIMITED, UNREACHABLE, ...
        String message = "";
    }

    /** Healthy servers on the LAN, in reply order. */
    static List<Found> discover() {
        Map<String, Found> replies = new LinkedHashMap<>();
        byte[] request = "{\"type\":\"bankntt-discover\",\"v\":1}".getBytes(StandardCharsets.UTF_8);
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setBroadcast(true);
            socket.setSoTimeout(250);
            long end = System.currentTimeMillis() + SCAN_MS;
            long nextSend = 0;
            byte[] buffer = new byte[4096];
            while (System.currentTimeMillis() < end) {
                if (System.currentTimeMillis() >= nextSend) {
                    for (InetAddress target : broadcastTargets()) {
                        try {
                            socket.send(new DatagramPacket(request, request.length, target, DISCOVERY_PORT));
                        } catch (Exception ignored) {
                            // one unreachable interface must not stop the scan
                        }
                    }
                    nextSend = System.currentTimeMillis() + 1000;
                }
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                } catch (SocketTimeoutException timeout) {
                    continue;
                }
                Found found = parseReply(packet);
                if (found != null && !replies.containsKey(found.url)) replies.put(found.url, found);
            }
        } catch (Exception ignored) {
            // no network: nothing found
        } finally {
            if (socket != null) socket.close();
        }
        List<Found> healthy = new ArrayList<>();
        for (Found found : replies.values()) {
            if (health(found.url)) healthy.add(found);
        }
        return healthy;
    }

    private static Set<InetAddress> broadcastTargets() {
        Set<InetAddress> targets = new LinkedHashSet<>();
        try {
            targets.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp() || nic.isLoopback()) continue;
                for (InterfaceAddress address : nic.getInterfaceAddresses()) {
                    if (address.getAddress() instanceof Inet4Address && address.getBroadcast() != null) {
                        targets.add(address.getBroadcast());
                    }
                }
            }
        } catch (Exception ignored) {
            // keep what we have
        }
        return targets;
    }

    private static Found parseReply(DatagramPacket packet) {
        if (!(packet.getAddress() instanceof Inet4Address)) return null;
        try {
            String text = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8);
            JSONObject body = new JSONObject(text);
            if (!"bankntt-server".equals(body.optString("type")) || body.optInt("v") != 1) return null;
            String name = body.optString("name", "").replaceAll("[\\u0000-\\u001f\\u007f]", "").trim();
            if (name.length() > 100) name = name.substring(0, 100);
            int port = body.optInt("port", 0);
            if (name.isEmpty() || port < 1 || port > 65535) return null;
            return new Found(name, "http://" + packet.getAddress().getHostAddress() + ":" + port);
        } catch (Exception invalid) {
            return null;
        }
    }

    /** GET {server}/api/health -> true only for 2xx with {"ok":true}. */
    static boolean health(String server) {
        HttpURLConnection conn = null;
        try {
            conn = open(server + "/api/health", "GET");
            if (conn.getResponseCode() / 100 != 2) return false;
            return new JSONObject(read(conn.getInputStream())).optBoolean("ok", false);
        } catch (Exception unreachable) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** "4k7-q2m" -> "4K7Q2M"; null unless it can be a server code (6 of A-Z without I/O, 2-9). */
    static String normalizeCode(String input) {
        String code = input == null ? "" : input.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return code.matches("[A-HJ-NP-Z2-9]{6}") ? code : null;
    }

    static PairResult pair(String server, String installId, String name, String code) {
        PairResult result = new PairResult();
        HttpURLConnection conn = null;
        try {
            JSONObject payload = new JSONObject();
            if (code != null && !code.isEmpty()) {
                payload.put("code", code);
            } else {
                payload.put("kind", "display");
                payload.put("name", name);
            }
            payload.put("installId", installId);
            conn = open(server + "/api/devices/pair", "POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("content-type", "application/json");
            try (OutputStream out = conn.getOutputStream()) {
                out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = conn.getResponseCode();
            InputStream stream = status / 100 == 2 ? conn.getInputStream() : conn.getErrorStream();
            JSONObject body = stream == null ? new JSONObject() : new JSONObject(read(stream));
            String token = body.optString("token", "");
            if (status / 100 == 2 && !token.isEmpty()) {
                if (!"display".equals(body.optString("kind"))) {
                    result.message = "Kode ini untuk kiosk, bukan untuk TV. Buat kode dari perangkat Layar TV.";
                    return result;
                }
                result.ok = true;
                result.token = token;
                result.name = body.optString("name", "");
                result.approved = !body.has("approved") || body.optBoolean("approved", true);
                return result;
            }
            JSONObject error = body.optJSONObject("error");
            result.code = error != null ? error.optString("code", "") : "";
            if (result.code.isEmpty() && status == 403) result.code = "DEVICE_REVOKED";
            if (result.code.isEmpty() && status == 429) result.code = "RATE_LIMITED";
            String message = error != null ? error.optString("message", "") : "";
            if (!message.isEmpty()) result.message = message;
            else if ("DEVICE_REVOKED".equals(result.code)) result.message = "TV ini dicabut oleh admin. Pulihkan di Admin → Perangkat.";
            else if ("RATE_LIMITED".equals(result.code)) result.message = "Terlalu banyak percobaan. Dicoba lagi nanti.";
            else result.message = "Pemasangan gagal (HTTP " + status + ").";
        } catch (Exception unreachable) {
            result.code = "UNREACHABLE";
            result.message = "Server " + server + " tidak dapat dihubungi.";
        } finally {
            if (conn != null) conn.disconnect();
        }
        return result;
    }

    private static HttpURLConnection open(String url, String method) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestProperty("accept", "application/json");
        return conn;
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = stream.read(chunk)) != -1) {
                out.write(chunk, 0, n);
                if (out.size() > 65536) break;
            }
            return out.toString("UTF-8");
        }
    }
}
