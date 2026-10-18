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
node scripts/mock-server.mjs 4545        # server tiruan; kode pemasangan: ABC234
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

1. Di panel admin web → **Perangkat**, daftarkan kiosk (atau pilih kiosk yang sudah ada) lalu tekan
   **Kode aplikasi**. Catat **alamat server** dan **kode pemasangan** (6 karakter, berlaku 30 menit,
   sekali pakai). Tautan lama kiosk itu berhenti berlaku begitu kode dipakai.
2. Di jendela "Pemasangan BANK NTT Ticket" isi:
   - **Alamat server**: misalnya `10.70.10.67:3000` (otomatis menjadi `http://10.70.10.67:3000`).
   - **Kode pemasangan**: boleh ditulis dengan tanda hubung atau huruf kecil (`4k7-q2m`).
   - **Printer tiket**: default printer bawaan Windows. Tekan **Cetak uji** untuk mencoba.
   - **PIN admin** (minimal 4 angka) dan ulangi.
3. Tekan **Simpan & pasangkan**. Bila berhasil, kiosk langsung terbuka dan aplikasi diatur
   agar berjalan otomatis saat Windows login.

## Keluar / mengubah pengaturan

Tekan **Ctrl + Shift + Alt + K** di kiosk, masukkan PIN admin, lalu pilih:

- **Keluar aplikasi**: menutup kiosk.
- **Ubah pengaturan**: membuka lagi jendela pengaturan. Kosongkan kode dan PIN bila tidak
  ingin mengubahnya; isi kode baru untuk memasangkan ulang (wajib bila alamat server diganti).
- **Batal**.

Setelah 5 kali PIN salah, prompt dikunci 60 detik.

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
| Halaman kiosk meminta login / "Sesi kiosk tidak valid" | Token perangkat dicabut di server. Pasangkan ulang dengan kode baru lewat **Ubah pengaturan**. |
| Windows memblokir installer | Lihat bagian SmartScreen di atas. |

Detail kejadian ada di `%APPDATA%\kiosk-antrian\logs\kiosk.log`.
