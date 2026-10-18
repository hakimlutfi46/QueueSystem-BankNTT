# BANK NTT Admin, Loket, dan TV (aplikasi Windows)

Tiga aplikasi Electron terpisah untuk PC di kantor cabang, dibuat dari **satu kode** di folder ini.
Setiap aplikasi punya installer, nama, appId, ikon, folder pengaturan, dan shortcut sendiri, jadi
ketiganya bisa terpasang berdampingan di PC yang sama. Tidak ada pemilih mode: peran aplikasi
ditanam saat installer dibuat.

| Aplikasi | Installer | Membuka | Jendela |
| --- | --- | --- | --- |
| **BANK NTT Admin** (`id.bankntt.antrian.admin`) | `BANK-NTT-Admin-Setup.exe` | `/admin` | Jendela biasa (maksimal), bisa diubah ukurannya. Unduhan laporan Excel/PDF dan installer diizinkan. |
| **BANK NTT Loket** (`id.bankntt.antrian.loket`) | `BANK-NTT-Loket-Setup.exe` | `/counter` | Jendela biasa (maksimal). Tombol Spasi tetap untuk halaman loket. |
| **BANK NTT TV** (`id.bankntt.antrian.tv`) | `BANK-NTT-TV-Setup.exe` | `/display?token=…` | Layar penuh terkunci seperti kiosk, suara otomatis, layar tidak tidur, berjalan otomatis saat Windows login. |

Server antrian (Next.js, port 3000) berjalan di PC mesin tiket. Semua aplikasi bekerja di jaringan
lokal cabang tanpa internet.

## Membuat installer

Dari root repo:

```bash
npm run apps:build                                              # ketiganya
node apps/desktop-client/scripts/build.mjs --app tv             # satu aplikasi saja
node apps/desktop-client/scripts/build.mjs --app admin --name "BANK NTT Admin" --icon public/brand/kiosk-app-icon.png
node apps/desktop-client/scripts/build.mjs --app all --offline  # tanpa internet (lihat di bawah)
```

Hasilnya di `apps/desktop-client/dist/<admin|loket|tv>/`, lalu disalin ke `downloads/`:
`BANK-NTT-Admin-Setup.exe`, `BANK-NTT-Loket-Setup.exe`, `BANK-NTT-TV-Setup.exe`, beserta
`downloads/desktop-apps.json` (nama file, nama aplikasi, appId, versi, ukuran, waktu build per aplikasi).
`--name` hanya bisa dipakai bersama satu `--app`. Ikon bawaan: `public/brand/kiosk-app-icon.png`.

- Peran ditanam lewat `extraMetadata` (`bankNttRole`, `name`, `productName`) di `package.json`
  dalam paket. `name` per peran (`bankntt-admin`, `bankntt-loket`, `bankntt-tv`) membuat folder
  instalasi berbeda: `%LOCALAPPDATA%\Programs\bankntt-tv\` dan seterusnya.
- Bisa dibuat di macOS, Linux, atau Windows tanpa wine. Installer NSIS *one-click* x64, tidak
  ditandatangani (`win.signExecutable: false`). Mac Apple Silicon memakai `toolsets.nsis: "1.2.1"`.
- `--offline`: electron-builder biasanya mengunduh `SHASUMS256.txt` dari GitHub untuk memeriksa
  zip Electron di cache. Dengan `--offline`, zip Electron win32-x64 yang sudah ada di cache unduhan
  Electron dipakai langsung (`electronDist`). Zip itu harus pernah diunduh sekali dengan internet.

Mencoba di komputer pengembang (TV berjendela, DevTools aktif):

```bash
cd apps/desktop-client
npm install
node node_modules/electron/install.js        # unduh binari Electron (npm memblokir install script)
node scripts/mock-server.mjs 4646 --udp-port 41399   # server tiruan (jangan pakai port 3000)
BANKNTT_DISCOVERY_PORT=41399 npm run dev:admin       # atau dev:loket / dev:tv
npm test                                             # node --test (discovery, pairing, peran)
npm run check                                        # node --check untuk semua file JS
```

`BANKNTT_USER_DATA=/tmp/uji` memakai folder pengaturan lain. Kode pemasangan server tiruan:
`ABC234` (TV), `KSK234` (kiosk, harus ditolak), `EXP234` (kedaluwarsa).

## Installer simulasi (Mac dan Ubuntu)

Untuk mensimulasikan satu cabang tanpa perangkat asli, Admin, Loket, dan TV juga bisa dibuat untuk
**MacBook Apple Silicon (macOS arm64)** dan **Ubuntu 24.04 LTS x64**. Ini hanya untuk pengembang;
cabang tetap memakai installer Windows di atas (yang tidak berubah sama sekali).

### Membuat

Dari root repo, di Mac:

```bash
npm run apps:build:mac      # .dmg arm64 untuk Admin, Loket, TV
npm run apps:build:linux    # AppImage + deb x64 untuk Admin, Loket, TV
node apps/desktop-client/scripts/build.mjs --app tv --platform linux   # satu aplikasi saja
node apps/desktop-client/scripts/build.mjs --app all --platform mac --offline
```

Hasilnya di `downloads/simulasi/` beserta `downloads/simulasi/desktop-apps.json` (daftar file,
ukuran, appId, waktu build per platform/aplikasi). `downloads/desktop-apps.json` dan installer
Windows tidak disentuh.

| Aplikasi | macOS | Ubuntu |
| --- | --- | --- |
| BANK NTT Admin (Simulasi) | `BANK-NTT-Admin-Simulasi-mac-arm64.dmg` | `BANK-NTT-Admin-Simulasi-linux-x86_64.AppImage`, `BANK-NTT-Admin-Simulasi-linux-amd64.deb` |
| BANK NTT Loket (Simulasi) | `BANK-NTT-Loket-Simulasi-mac-arm64.dmg` | `BANK-NTT-Loket-Simulasi-linux-x86_64.AppImage`, `BANK-NTT-Loket-Simulasi-linux-amd64.deb` |
| BANK NTT TV (Simulasi) | `BANK-NTT-TV-Simulasi-mac-arm64.dmg` | `BANK-NTT-TV-Simulasi-linux-x86_64.AppImage`, `BANK-NTT-TV-Simulasi-linux-amd64.deb` |

Bedanya dengan aplikasi Windows:

- Nama berakhiran **(Simulasi)**, juga di judul setiap jendela. appId `….sim`
  (`id.bankntt.antrian.tv.sim`), nama paket `bankntt-admin-sim` / `bankntt-loket-sim` /
  `bankntt-tv-sim` (juga nama paket deb dan perintahnya di Ubuntu).
- Folder pengaturan sendiri: `~/Library/Application Support/bankntt-<peran>-sim/` (macOS) atau
  `~/.config/bankntt-<peran>-sim/` (Ubuntu), berisi `config.json` dan `logs/`.
- TV **tidak** diatur berjalan otomatis saat login, supaya laptop tidak diambil alih. Layar penuh
  tetap terkunci; keluar dengan **Ctrl+Shift+Alt+K** (di Mac juga **Cmd+Shift+Option+K**) lalu PIN.
- Di Mac, Admin dan Loket punya menu aplikasi biasa (Tentang, Ganti server… Cmd+Shift+S,
  Sembunyikan, Keluar Cmd+Q) serta menu Edit, sehingga Cmd+C / Cmd+V berfungsi.
- Build Mac tidak ditandatangani dengan sertifikat Apple (`identity: null`, tanpa hardened
  runtime). Setelah *fuse* Electron diubah, aplikasi ditandatangani ulang secara **ad-hoc**
  (`codesign --sign -`, `electronFuses.resetAdHocDarwinSignature`); tanpa itu macOS Apple Silicon
  langsung menghentikan aplikasi ("Code Signature Invalid").
- Build Linux memakai toolset AppImage `1.0.3` electron-builder (runtime statis, alat bawaan untuk
  Mac arm64) dan dibuat di Mac. Unduhan alat build hanya dari rilis resmi Electron dan
  electron-builder-binaries di GitHub (dengan checksum). `--offline` memakai zip Electron
  `darwin-arm64` / `linux-x64` dari cache, sama seperti untuk Windows.

### Memasang di Mac

Buka file `.dmg`, seret aplikasinya ke **Applications**. Karena belum ditandatangani Apple,
Gatekeeper menolak saat dibuka pertama kali:

- Klik kanan aplikasi di Applications → **Open** → **Open** (di macOS terbaru: buka sekali, lalu
  **System Settings → Privacy & Security → Open Anyway**), atau
- lewat Terminal: `xattr -cr "/Applications/BANK NTT Admin (Simulasi).app"`.

macOS bisa bertanya apakah aplikasi boleh **menemukan perangkat di jaringan lokal**; pilih
**Allow**, kalau tidak pencarian server di LAN gagal (server di laptop yang sama tetap ditemukan).

### Memasang di Ubuntu 24.04

```bash
sudo apt install ./BANK-NTT-Admin-Simulasi-linux-amd64.deb     # muncul di menu aplikasi (kategori Office)
bankntt-admin-sim                                                # atau jalankan dari terminal
sudo apt remove bankntt-admin-sim                                # menghapus
```

Atau tanpa memasang, pakai AppImage:

```bash
chmod +x BANK-NTT-TV-Simulasi-linux-x86_64.AppImage
./BANK-NTT-TV-Simulasi-linux-x86_64.AppImage
```

AppImage butuh FUSE. Bila muncul galat FUSE / `libfuse.so.2`, pasang `sudo apt install libfuse2t64`
(nama paketnya di 24.04), atau jalankan dengan `--appimage-extract-and-run`.

### Server untuk simulasi

Server antrian dijalankan dari repo di laptop pengembang:

```bash
npm run dev          # server Next.js di port 3000
npm run discovery    # penjawab UDP 41234 supaya aplikasi menemukan server (kontrak yang sama dengan server cabang)
```

Aplikasi di laptop yang sama menemukan server lewat `127.0.0.1`; aplikasi di Ubuntu (jaringan yang
sama) lewat siaran LAN. Firewall Mac/Ubuntu harus mengizinkan UDP 41234 dan TCP 3000 masuk. Bila
server tidak ditemukan, ketik alamatnya manual, misalnya `192.168.1.52:3000`, lalu **Periksa**.

Mencoba tanpa installer: `npm run dev:admin -- --simulation` (atau `BANKNTT_SIMULATION=1`) dari
`apps/desktop-client` menjalankan mode simulasi langsung dari kode.

## Memasang

1. Unduh installer dari panel admin web (atau salin dari folder `downloads/` di PC server lewat
   flashdisk), lalu jalankan. Installer langsung memasang untuk pengguna Windows saat itu dan
   membuka aplikasinya.
2. **SmartScreen**: karena belum ditandatangani, Windows bisa menampilkan "Windows protected your PC".
   Klik **More info → Run anyway**.

## Pertama kali: mencari server

Jendela pengaturan langsung mencari server antrian di jaringan ("Mencari server antrian di jaringan…"):

- Aplikasi mengirim siaran UDP ke port **41234** (ke `255.255.255.255`, alamat broadcast setiap
  kartu jaringan, dan `127.0.0.1` untuk PC server itu sendiri) tiap 1 detik selama ±4 detik.
- Setiap server yang menjawab diperiksa lewat `GET /api/health`. Daftar menampilkan nama cabang
  dan alamatnya; alamat jaringan (LAN) di atas, "PC ini" (127.0.0.1) di bawah.
- **Admin/Loket**: bila tepat satu server ditemukan, aplikasi langsung tersambung. Bila lebih dari
  satu, pilih salah satu.
- **TV**: server terpilih otomatis bila hanya satu, lalu isi kode pemasangan dan PIN (lihat di bawah).
- Tidak ditemukan? Ketik alamatnya, misalnya `192.168.1.53:3000`, lalu **Periksa**.

Alamat dan nama server disimpan. Saat dibuka berikutnya, aplikasi langsung memakai server itu.

### Server tidak terjangkau / IP berubah

Bila server tidak dapat dihubungi, muncul layar "Menyambung ke server…":

- Aplikasi mencoba lagi setiap 5 detik.
- Di belakang layar aplikasi mencari server di jaringan (segera, lalu tiap 30 detik). Bila server
  **dengan nama yang sama** ditemukan di alamat baru (misalnya IP PC server berubah karena DHCP),
  aplikasi pindah otomatis dan menyimpan alamat baru. TV tetap memakai token pemasangannya.
- Tombol **Cari ulang server** mencari saat itu juga. Di Admin/Loket, bila server lama tidak
  ditemukan, jendela pemilih server terbuka.

## TV: pemasangan (pairing)

1. Di panel admin web → **Perangkat**, daftarkan TV lalu tekan **Kode aplikasi**. Catat kode
   pemasangan (6 karakter, sekali pakai, berlaku 30 menit).
2. Di jendela "Pemasangan BANK NTT TV": pilih server, isi **Kode pemasangan** (boleh `abc-234`),
   lalu **PIN admin** (minimal 4 angka) dua kali. Tekan **Simpan & pasangkan**.
3. Hanya kode untuk perangkat TV yang diterima; kode kiosk ditolak.
4. Setelah berhasil, layar TV terbuka penuh dan aplikasi diatur berjalan otomatis saat login.

## Pintasan

| Aplikasi | Pintasan | Fungsi |
| --- | --- | --- |
| Admin, Loket | **Ctrl+Shift+S** (menu Aplikasi → Ganti server…) | Kembali ke pemilih server |
| Admin, Loket | Ctrl+R / F5 | Muat ulang (saat offline: coba sambung sekarang) |
| Admin, Loket | Ctrl+= / Ctrl+- / Ctrl+0 | Perbesar / perkecil / ukuran normal |
| Admin, Loket | F11 | Layar penuh |
| Admin, Loket | Alt+F4 (menu Aplikasi → Keluar) | Keluar |
| TV | **Ctrl+Shift+Alt+K** lalu PIN | **Keluar aplikasi** atau **Ubah pengaturan** (server, pemasangan ulang, PIN) |

Di TV, Alt+F4, F5, F11, F12, Esc, Ctrl+W/Q/R, zoom, dan menu diblokir. Setelah 5 kali PIN salah,
prompt dikunci 60 detik. DevTools tidak tersedia di aplikasi terpasang.

Admin: unduhan hanya diterima dari server antrian; dialog simpan dibuka di folder **Downloads**.
Tautan "Cetak ulang" tiket dibuka di jendela kecil yang sama terkuncinya. Situs lain selalu diblokir.

## Lokasi pengaturan dan log

| Aplikasi | Pengaturan | Log |
| --- | --- | --- |
| Admin | `%APPDATA%\bankntt-admin\config.json` | `%APPDATA%\bankntt-admin\logs\admin.log` |
| Loket | `%APPDATA%\bankntt-loket\config.json` | `%APPDATA%\bankntt-loket\logs\loket.log` |
| TV | `%APPDATA%\bankntt-tv\config.json` | `%APPDATA%\bankntt-tv\logs\tv.log` |

`config.json` berisi alamat server, nama server, dan untuk TV: token perangkat, hash scrypt PIN,
serta nama perangkat. Log dirotasi ±1 MB; token dan PIN tidak pernah dicatat.

Lupa PIN TV? Tutup aplikasi lewat Task Manager, hapus `%APPDATA%\bankntt-tv\config.json`, lalu
jalankan lagi untuk memasangkan ulang.

## Pemecahan masalah

| Gejala | Yang dicek |
| --- | --- |
| "Tidak ada server ditemukan" | PC server menyala dan aplikasi server berjalan; PC ini di jaringan yang sama. **Firewall Windows di PC server harus mengizinkan UDP 41234 masuk** (installer server mengaturnya). Router/switch dengan *client isolation* (Wi-Fi tamu) memblokir siaran: ketik alamatnya manual. |
| Server muncul tapi tidak bisa dipilih / "tidak menjawab" | Port 3000 TCP di firewall PC server, atau database server mati (`/api/health` gagal). |
| Layar "Menyambung ke server…" terus | Server mati atau pindah jaringan. Tekan **Cari ulang server**, atau Ctrl+Shift+S (Admin/Loket) / Ctrl+Shift+Alt+K → Ubah pengaturan (TV). |
| TV meminta pendaftaran perangkat | Token dicabut di server. Pasangkan ulang lewat Ubah pengaturan dengan kode baru. |
| "Kode ini bukan untuk perangkat TV antrian." | Kode dibuat untuk kiosk. Buat kode dari perangkat TV di Admin → Perangkat. |
| TV tidak bersuara | Volume Windows/TV, dan pilih perangkat audio yang benar di Windows. |
| Unduhan laporan tidak muncul | Lihat log Admin; unduhan dari alamat selain server antrian diblokir. |
