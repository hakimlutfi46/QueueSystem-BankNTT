# BANK NTT Ticket (aplikasi kiosk Windows)

Aplikasi Electron untuk PC kiosk pengambilan nomor antrian. Aplikasi membuka halaman
`/kiosk` dari server antrian dalam mode layar penuh terkunci, lalu mencetak tiket
**langsung ke printer thermal tanpa dialog cetak** (80 mm atau 58 mm).

- Halaman web kiosk mendeteksi aplikasi lewat `window.kioskApp` dan memanggil
  `printTicket()` alih-alih `window.print()`.
- Pengaturan tersimpan di `%APPDATA%\kiosk-antrian\config.json`
  (alamat server, token perangkat, printer, hash PIN, nama perangkat). PIN hanya disimpan
  sebagai hash scrypt bergaram.
- Log ada di `%APPDATA%\kiosk-antrian\logs\kiosk.log` (dirotasi ±1 MB, token dan PIN tidak pernah dicatat).

## Membuat installer

Dari root repo:

```bash
npm run kiosk:build
```

Perintah ini memasang dependensi aplikasi bila belum ada (`apps/kiosk-desktop/node_modules`),
membuat installer NSIS Windows x64, lalu menyalinnya ke `downloads/BANK-NTT-Ticket-Setup.exe`
beserta `downloads/kiosk-installer.json`. Nama dan ikon bisa diganti:

```bash
npm run kiosk:build -- --name "BANK NTT Ticket" --icon public/brand/kiosk-app-icon.png
```

Admin bisa melakukan hal yang sama dari **Admin → Perangkat → Aplikasi kiosk Windows** (Ubah, lalu
Simpan & build ulang). Ikon bawaan ada di `public/brand/kiosk-app-icon.png`.

Bisa dijalankan di macOS, Linux, atau Windows tanpa wine: electron-builder menanam ikon dan nama ke
exe dengan resedit (JavaScript murni). Installer tidak ditandatangani (`win.signExecutable: false`).

Catatan Mac Apple Silicon: konfigurasi memakai `toolsets.nsis: "1.2.1"` (makensis 3.12)
karena makensis bawaan lama hanya x86_64 dan tidak bisa jalan tanpa Rosetta.

Untuk mencoba di komputer pengembang (mode berjendela, bukan kiosk):

```bash
cd apps/kiosk-desktop
npm install
node node_modules/electron/install.js   # unduh binari Electron (npm memblokir install script)
node scripts/mock-server.mjs 4545        # server tiruan; disetujui otomatis setelah 10 detik
npm run dev                              # isi "Alamat server" dengan 127.0.0.1:4545
npm run check                            # node --check untuk semua file JS
```

### Mencoba tanpa printer (laptop/MacBook)

```bash
npm run dev:no-printer                   # sama dengan: electron . --dev --no-printer
```

Status printer selalu siap dan setiap tiket (juga **Cetak uji**) disimpan sebagai PDF seukuran kertas
thermal di folder `Downloads/kiosk-tiket-pdf`, lalu langsung dibuka. Halaman tiket yang dirender sama
dengan cetak sungguhan. Bisa juga lewat `KIOSK_NO_PRINTER=1`. Mode ini hanya berlaku saat aplikasi
dijalankan dari kode sumber; aplikasi yang terpasang dari installer mengabaikannya, jadi kiosk di cabang
tetap tidak mengeluarkan nomor tanpa tiket tercetak.

## Installer simulasi (Mac dan Ubuntu)

Untuk mensimulasikan cabang di MacBook (Apple Silicon) atau PC Ubuntu 24.04 LTS x64 tanpa printer
thermal. Kodenya sama dengan aplikasi Windows, hanya saja build ini selalu dalam **mode simulasi**.

```bash
npm run kiosk:build:mac      # -> downloads/simulasi/BANK-NTT-Ticket-Simulasi-mac-arm64.dmg
npm run kiosk:build:linux    # -> downloads/simulasi/BANK-NTT-Ticket-Simulasi-linux-x86_64.AppImage
                             #    dan downloads/simulasi/BANK-NTT-Ticket-Simulasi-linux-amd64.deb
```

Keduanya bisa dibuat di Mac (juga Apple Silicon tanpa Rosetta). Build pertama butuh internet untuk
mengunduh Electron dan alat build dari GitHub; setelah itu tersimpan di cache. `--with-server` tidak
bisa dipakai di sini karena bundle server hanya untuk Windows. Installer simulasi tidak masuk
`downloads/kiosk-installer.json`, jadi tidak pernah ditawarkan di Admin → Perangkat.

Bedanya dengan aplikasi Windows:

- Nama aplikasi **BANK NTT Ticket (Simulasi)**. Judul jendela dan layar pemasangan menulis
  "Simulasi — tiket disimpan sebagai PDF".
- Tiket (juga **Cetak uji**) selalu disimpan sebagai PDF di `~/Downloads/kiosk-tiket-pdf`, lalu dibuka
  dengan penampil PDF bawaan. Saat kiosk layar penuh, penampil itu bisa muncul di belakangnya; berkasnya
  tetap ada di folder tadi.
- Tidak berjalan otomatis saat login.
- Pengaturan dan log terpisah dari kiosk sungguhan: `~/Library/Application Support/kiosk-antrian-sim`
  (Mac) atau `~/.config/kiosk-antrian-sim` (Ubuntu), log di `logs/kiosk.log`.
- Keluar: **Ctrl + Shift + Alt + K** (di Mac **Cmd + Shift + Option + K** juga bisa), lalu PIN bila
  dipasang, seperti di Windows. Khusus simulasi (dan `npm run dev`), **Cmd + Q** (Mac), **Ctrl + Q**
  (Ubuntu), menutup jendela, dan Dock → Keluar langsung menutup aplikasi, supaya laptop pengembang
  tidak terkunci. Di kiosk Windows terpasang, Alt+F4, Ctrl+Q, dan menutup jendela diblokir.
  `KIOSK_LOCKDOWN=1 npm run dev` mencoba penguncian produksi saat pengembangan.

### Memasang di Mac

1. Buka file `.dmg`, seret **BANK NTT Ticket (Simulasi)** ke **Applications**.
2. Aplikasi ditandatangani *ad-hoc* (tanpa sertifikat Apple). Di Mac tempat build dibuat, aplikasi
   langsung terbuka. Di Mac lain (diunduh, AirDrop), Gatekeeper menolaknya: klik kanan aplikasi →
   **Open** → **Open**, atau bila muncul pesan "rusak" jalankan
   `xattr -cr "/Applications/BANK NTT Ticket (Simulasi).app"`.
3. Kiosk layar penuh di Mac menyembunyikan Dock dan menonaktifkan Cmd+Tab; tutup dengan Cmd+Q.

### Memasang di Ubuntu 24.04

- **deb** (disarankan): `sudo apt install ./BANK-NTT-Ticket-Simulasi-linux-amd64.deb`. Aplikasi muncul
  di menu sebagai "BANK NTT Ticket (Simulasi)" (perintah `kiosk-antrian-sim`); paket memasang profil
  AppArmor yang dibutuhkan sandbox Electron di Ubuntu 24.04. Hapus: `sudo apt remove kiosk-antrian-sim`.
- **AppImage**: `chmod +x BANK-NTT-Ticket-Simulasi-linux-x86_64.AppImage`, lalu jalankan. Bila menolak
  jalan karena FUSE, pasang `sudo apt install libfuse2t64`. Bila berhenti dengan pesan tentang
  *SUID sandbox helper* (pembatasan AppArmor Ubuntu 24.04), jalankan dengan `--no-sandbox` atau pakai deb.

### Server dan pemasangan

Jalankan server dari repo di laptop itu (`npm run sim` atau `npm run dev`, alamat `127.0.0.1:3000`)
atau di PC lain di jaringan yang sama.

Layar pemasangan **otomatis memindai jaringan lokal lewat UDP 41234** untuk menemukan server antrian.
Server yang menjawab akan langsung muncul di daftar "Server di jaringan" dan terpilih otomatis bila
hanya ada satu server. Pemasangan sama dengan di cabang: kiosk mendaftar otomatis, lalu admin
menyetujuinya di Admin → Perangkat (lihat "Pemasangan pertama"). Bila IP server cabang berubah
karena DHCP, aplikasi akan mendeteksi dan memperbarui alamatnya secara otomatis.

## Installer Ticket + Server (mesin tiket utama)

Untuk cabang tanpa server terpisah: mesin tiket utama sekaligus menjadi server antrian. Installer ini
memuat aplikasi kiosk **dan** server lengkap (PostgreSQL, Node.js, aplikasi web), jadi PC tidak perlu
internet, npm, atau Docker.

```bash
npm run server:bundle                          # sekali, atau setelah kode web berubah
npm run kiosk:build -- --with-server           # -> downloads/BANK-NTT-Ticket-Server-Setup.exe
```

- Dipasang untuk semua pengguna (`C:\Program Files\BANK NTT Ticket`) dan meminta izin Administrator.
  Setelah berkas disalin, installer menjalankan `resources\server\install-server.ps1`: PostgreSQL dan
  server antrian menjadi layanan Windows yang menyala otomatis, port 3000 dan UDP 41234 (penemuan
  server) dibuka untuk jaringan lokal, dan cadangan harian dijadwalkan. Rincian di
  [`apps/server-bundle/README.md`](../server-bundle/README.md).
- Data ada di `C:\ProgramData\BankNTT` dan tidak ikut terhapus saat pembaruan maupun uninstall.
  Pembaruan: jalankan installer versi baru; layanan dihentikan, berkas program diganti, migrasi
  database berjalan saat server menyala lagi.
- Saat pemasangan pertama, alamat server sudah terisi `127.0.0.1:3000`. Setelah tersambung, tekan
  **Buka panel admin** untuk masuk ke Admin → Perangkat di browser dan setujui kiosk ini.
- Installer ini tidak muncul di Admin → Perangkat. Kiosk tambahan di cabang yang sama memakai
  installer biasa (`BANK-NTT-Ticket-Setup.exe`), supaya tidak ada server kedua.
- Bila gagal, installer menampilkan pesan dan rinciannya ada di
  `C:\ProgramData\BankNTT\logs\install.log`. Pemeriksaan cepat:
  `powershell -ExecutionPolicy Bypass -File "C:\Program Files\BANK NTT Ticket\resources\server\status-server.ps1"`.

## Memasang di PC kiosk

1. Di PC kiosk, buka panel admin web → **Perangkat** → **Unduh installer (.exe)** (atau salin
   `downloads/BANK-NTT-Ticket-Setup.exe` dari server lewat flashdisk), lalu jalankan.
   Installer *one-click*: langsung terpasang untuk pengguna Windows saat itu dan aplikasi
   terbuka setelah selesai.
2. **SmartScreen**: karena installer belum ditandatangani, Windows bisa menampilkan
   "Windows protected your PC". Klik **More info → Run anyway**. Di jaringan kantor yang
   memakai kebijakan ketat, minta IT memasukkan file ini ke daftar izin.
3. Pasang driver printer thermal dan pastikan printer muncul di *Printers & scanners*.
   Atur ukuran kertas driver ke 80 mm (atau 58 mm) dan aktifkan pemotong kertas otomatis
   bila ada.

## Pemasangan pertama (pairing)

Pemasangan kini otomatis, tanpa kode:

1. Di jendela "Pemasangan BANK NTT Ticket", server di jaringan dicari dan dipilih otomatis (atau
   ketik **Alamat server**, misalnya `10.70.10.67:3000`). Pilih **Printer tiket** (tekan **Cetak uji**
   untuk mencoba) dan, disarankan, isi **PIN admin** (minimal 4 angka) dua kali.
2. Tekan **Simpan & sambungkan**. Kiosk mendaftar sendiri ke server dengan ID instalasi acak yang
   dibuat sekali dan disimpan di `config.json` (`installId`), jadi memasang ulang atau menyambung
   ulang tidak pernah membuat perangkat ganda.
3. Kiosk menampilkan "menunggu persetujuan" sampai admin menyetujuinya di panel admin web →
   **Perangkat** (atau admin menyalakan **Terima perangkat baru otomatis**). Halaman itu memeriksa
   sendiri tiap 5 detik dan langsung membuka kiosk begitu disetujui. Aplikasi diatur agar berjalan
   otomatis saat Windows login.

**Kode pemasangan (opsional)**: cara lama tetap bisa. Bila admin memberi kode 6 karakter dari
Admin → Perangkat → **Kode aplikasi**, isi di kolom **Kode pemasangan** (boleh `4k7-q2m`).

Status perangkat yang ditampilkan server dan reaksi aplikasi:

| Status | Arti | Aplikasi |
| --- | --- | --- |
| menunggu persetujuan | Admin belum menyetujui | Diam; halaman memeriksa sendiri tiap 5 detik |
| dicabut | Admin mencabut instalasi ini | Diam, tidak memasangkan ulang otomatis |
| tidak dikenal | Token tidak dikenal server (mis. database direset) | Memasangkan ulang sekali dengan `installId` (paling sering sekali per menit), lalu memuat ulang kiosk |
| dibatasi | Terlalu banyak percobaan | Diam; halaman mencoba lagi sendiri |

## Keluar / mengubah pengaturan

Tekan **Ctrl + Shift + Alt + K** di kiosk:

- **Dengan PIN admin**: masukkan PIN, lalu pilih **Keluar aplikasi**, **Ubah pengaturan**, atau
  **Batal**. Setelah 5 kali PIN salah, prompt dikunci 60 detik.
- **Tanpa PIN**: jendela pengaturan langsung terbuka. Artinya siapa pun yang memegang keyboard bisa
  membuka pengaturan, jadi PIN sangat disarankan.

Di jendela pengaturan, kosongkan kode dan PIN bila tidak ingin mengubahnya. Tombol **Keluar aplikasi**
di pengaturan menutup kiosk. Di kiosk Windows terpasang, Alt+F4, Ctrl+Q, dan menutup jendela tidak
pernah menutup aplikasi; hanya **Keluar aplikasi** atau Windows shutdown / log off.

Lupa PIN? Tutup aplikasi lewat Task Manager (atau login sebagai admin Windows), hapus
`%APPDATA%\kiosk-antrian\config.json`, lalu jalankan aplikasi untuk memasangkan ulang.

## Penguncian penuh Windows (disarankan)

Aplikasi sudah memblokir Alt+F4, Ctrl+W/Q/R, F5, F11, F12, Ctrl+Shift+I/J/C, Esc, menu,
navigasi ke situs lain, dan jendela baru. Tombol **Windows**, **Ctrl+Alt+Del**, dan **Win+L**
tidak bisa diblokir aplikasi apa pun. Untuk penguncian penuh:

1. Buat akun Windows lokal khusus, misalnya `kiosk` (bukan administrator).
2. Login sebagai `kiosk`, pasang aplikasi, lakukan pairing (agar autostart terdaftar di akun itu).
3. **Auto-login**: jalankan `netplwiz`, hapus centang "Users must enter a user name and password"
   untuk akun `kiosk` (atau gunakan Sysinternals *Autologon*).
4. **Assigned Access / Shell Launcher** (Windows 10/11 Pro, Enterprise, Education):
   *Settings → Accounts → Other users → Set up a kiosk* hanya mendukung aplikasi UWP/Edge, jadi
   untuk aplikasi Win32 seperti ini gunakan **Shell Launcher v2** (Enterprise/Education) atau
   Assigned Access multi-app (XML/Intune) yang mengizinkan
   `%LOCALAPPDATA%\Programs\kiosk-antrian\BANK NTT Ticket.exe` sebagai satu-satunya aplikasi.
   Dengan Shell Launcher, aplikasi ini menggantikan Explorer sehingga taskbar dan Start tidak ada.
5. Matikan sleep/screen saver, notifikasi, dan Windows Update di jam operasional.

## Pemecahan masalah

| Gejala | Yang dicek |
| --- | --- |
| "Printer … tidak ditemukan." | Nama printer berubah/terhapus. Buka **Ubah pengaturan**, tekan ⟳, pilih ulang printer. |
| "Printer sedang offline." | Kabel USB/daya printer, dan pastikan "Use Printer Offline" tidak dicentang di Windows. |
| "Kertas habis." / "Kertas macet." | Isi/rapikan kertas lalu tutup penutup printer. Tidak semua driver USB melaporkan status ini. |
| Tiket terpotong, terlalu kecil, atau kertas keluar panjang | Aplikasi mengirim ukuran halaman sesuai lebar `@page` (80/58 mm) dan tinggi isi tiket. Bila driver menolak ukuran kustom, tambahkan `"usePrinterDefaultPageSize": true` di `config.json` dan atur ukuran kertas di driver. |
| Layar "Menyambung ke server…" terus | Server mati atau alamat salah. Aplikasi mencoba lagi tiap 5 detik. Cek jaringan dan alamat di pengaturan. |
| Kiosk "menunggu persetujuan" terus | Setujui kiosk di Admin → Perangkat, atau nyalakan **Terima perangkat baru otomatis**. |
| Kiosk "dicabut" | Admin mencabut instalasi ini. Pulihkan di Admin → Perangkat, atau pasangkan dengan kode baru lewat **Ubah pengaturan**. |
| Windows memblokir installer | Lihat bagian SmartScreen di atas. |

Detail kejadian ada di `%APPDATA%\kiosk-antrian\logs\kiosk.log`.
