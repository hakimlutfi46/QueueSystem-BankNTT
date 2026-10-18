# Panduan Pengujian & Pemasangan Mode Produksi di PC Kios Tiket

Dokumen ini memandu langkah demi langkah pengujian mode produksi (*production*) antrian BANK NTT langsung di komputer fisik PC Kios Tiket (Windows 10/11 64-bit).

---

## 1. Lokasi Berkas Installer (*File Paths*)

Semua berkas installer telah selesai dibuat dan berada di folder repositori:

### A. Installer Produksi Windows (Untuk PC Kantor Cabang & PC Kios)
Folder lokal di komputer Anda:
`/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/`

| Nama Berkas | Ukuran | Peruntukan / Komputer Target | File Path Lengkap |
| :--- | :--- | :--- | :--- |
| **`BANK-NTT-Ticket-Server-Setup.exe`** | **182 MB** | **PC Kios Tiket Utama (Kiosk + Server Sekaligus)**<br>Direkomendasikan untuk cabang offline tanpa server terpisah. | `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/BANK-NTT-Ticket-Server-Setup.exe` |
| **`BANK-NTT-Ticket-Setup.exe`** | 106 MB | **PC Kios Tiket Tambahan**<br>Hanya aplikasi kiosk tiket (bila server cabang berada di PC lain). | `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/BANK-NTT-Ticket-Setup.exe` |
| **`BANK-NTT-Loket-Setup.exe`** | 106 MB | **PC Loket Petugas (Teller & CS)**<br>Aplikasi mandiri loket untuk memanggil antrian. | `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/BANK-NTT-Loket-Setup.exe` |
| **`BANK-NTT-TV-Setup.exe`** | 106 MB | **PC Display TV Ruang Tunggu**<br>Layar penuh antrian dengan pemanggilan suara otomatis. | `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/BANK-NTT-TV-Setup.exe` |
| **`BANK-NTT-Admin-Setup.exe`** | 106 MB | **PC Supervisor / Pimpinan Cabang**<br>Panel administrasi cabang dan unduh laporan. | `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/BANK-NTT-Admin-Setup.exe` |

---

### B. Installer Simulasi (Khusus Laptop Pengembang untuk Testing)
Folder: `/Users/eldash/Documents/code/queue-system-bank-ntt/downloads/simulasi/`

*Karakteristik mode simulasi: tiket tidak dicetak ke kertas thermal, melainkan disimpan sebagai PDF di folder `Downloads/kiosk-tiket-pdf/`, dan tidak mengunci autostart laptop.*

- **macOS Apple Silicon (arm64 `.dmg`)**:
  - `downloads/simulasi/BANK-NTT-Ticket-Simulasi-mac-arm64.dmg`
  - `downloads/simulasi/BANK-NTT-Loket-Simulasi-mac-arm64.dmg`
  - `downloads/simulasi/BANK-NTT-TV-Simulasi-mac-arm64.dmg`
  - `downloads/simulasi/BANK-NTT-Admin-Simulasi-mac-arm64.dmg`
- **Ubuntu / Linux x64 (`.AppImage` & `.deb`)**:
  - Tersedia file `.AppImage` dan `.deb` untuk Ticket, Loket, TV, dan Admin di folder yang sama.

---

## 2. Cara Kerja di PC Kios Tiket: Anda Tinggal Pasang Aplikasinya?

**Ya, Anda cukup memasang satu installer saja di PC Kios Tiket.**

Sistem antrian BANK NTT telah dirancang secara *all-in-one* untuk cabang offline:
- **Jika PC Kios difungsikan sebagai Server Cabang sekaligus**, gunakan berkas:  
  **`BANK-NTT-Ticket-Server-Setup.exe`**
- Saat dijalankan, installer ini otomatis:
  1. Menginstal runtime database PostgreSQL lokal terisolasi di `C:\ProgramData\BankNTT\pgdata`.
  2. Menginstal runtime server Next.js terisolasi.
  3. Mendaftarkan layanan latar belakang Windows (*Windows Services*) bernama `BankNTT-PostgreSQL` dan `BankNTT-Server`.
  4. Membuka port firewall (port 3000 untuk web dan port UDP 41234 untuk penemuan otomatis).
  5. Membuka aplikasi Kiosk Layar Penuh BANK NTT Ticket.

*Artinya: PC Kios tersebut tidak membutuhkan instalasi Git, Node.js, Docker, atau terminal secara manual. Cukup jalankan installer `.exe`.*

---

## 3. Langkah Demi Langkah Pemasangan di PC Kios Tiket

### Langkah 1: Persiapan
1. Siapkan **Flashdisk USB**.
2. Salin berkas berikut dari laptop ke flashdisk:
   - `BANK-NTT-Ticket-Server-Setup.exe` (182 MB)
   - *(Opsional untuk PC lain di cabang)*: `BANK-NTT-Loket-Setup.exe` dan `BANK-NTT-TV-Setup.exe`.
3. Pastikan printer thermal (USB) sudah tercolok ke PC Kios dan driver bawaan printernya telah terpasang di Windows (muncul di *Windows Settings → Printers & Scanners*).
4. Pastikan PC Kios dan PC Loket/TV terhubung ke jaringan lokal yang sama (misal lewat router/switch kantor cabang).

---

### Langkah 2: Jalankan Installer di PC Kios
1. Tancapkan flashdisk di PC Kios Tiket.
2. Klik kanan pada **`BANK-NTT-Ticket-Server-Setup.exe`** → pilih **Run as administrator**.
3. **Peringatan Windows SmartScreen**:
   - Jika muncul jendela biru *"Windows protected your PC"*, klik **More info** lalu klik tombol **Run anyway**.
4. Proses instalasi akan berjalan:
   - Berkas program dipasang ke `C:\Program Files\BANK NTT Ticket`.
   - Layanan database dan server akan dimulai secara otomatis di latar belakang.
   - Aplikasi Kiosk BANK NTT Ticket akan otomatis terbuka.

---

### Langkah 3: Konfigurasi Awal (Layar Pemasangan / Setup Kiosk)
Saat pertama kali terbuka, aplikasi menampilkan jendela pengaturan kiosk:

1. **Alamat Server**:
   - Karena server berjalan di PC Kios itu sendiri, alamat otomatis terdeteksi atau dapat diisi:  
     `http://127.0.0.1:3000` (atau IP lokal PC Kios, misalnya `http://192.168.1.50:3000`).
2. **Kode Pemasangan (Pairing)**:
   - Buka browser di PC Kios (atau dari laptop lain di jaringan yang sama) ke:  
     `http://127.0.0.1:3000/admin` (atau `http://<IP-PC-KIOS>:3000/admin`).
   - Masuk dengan akun admin bawaan:
     - **Username**: `admin`
     - **Password**: `Password123` *(sistem akan meminta ganti password saat login pertama)*.
   - Buka menu **Perangkat** → pilih perangkat Kiosk (atau klik **Tambah Perangkat** tipe Kiosk).
   - Klik tombol **Kode aplikasi** untuk mendapatkan **6 digit kode pemasangan** (berlaku 30 menit).
   - Masukkan 6 digit kode tersebut ke formulir aplikasi kiosk.
3. **Printer Tiket**:
   - Pilih nama printer thermal yang terdeteksi dari daftar *dropdown*.
   - Tekan tombol **Cetak uji** untuk memastikan printer mengeluarkan struk uji coba.
4. **PIN Admin Kiosk**:
   - Masukkan PIN angka (minimal 4 digit, misalnya `1234`) dan ulangi. PIN ini digunakan teknisi/petugas jika ingin keluar dari layar kiosk atau mengubah printer di kemudian hari.
5. Klik **Simpan & pasangkan**.

Aplikasi langsung beralih ke layar penuh Kiosk Tiket BANK NTT, siap melayani nasabah mengambil nomor antrian!

---

## 4. Cara Menghubungkan PC Loket dan TV ke Server PC Kios

Setelah PC Kios berjalan sebagai server cabang:

1. **PC Loket Petugas (Teller / CS)**:
   - Salin dan jalankan `BANK-NTT-Loket-Setup.exe` di PC masing-masing petugas.
   - Saat aplikasi dibuka, fitur **UDP Discovery** akan langsung mendeteksi server PC Kios di jaringan secara otomatis (tidak perlu mengetik IP manual!).
   - Petugas login dengan akun masing-masing (dibuat oleh Admin di menu Pengguna).
   - Petugas cukup menekan tombol **Spasi** untuk memanggil nomor antrian berikutnya.
2. **PC Display TV Ruang Tunggu**:
   - Salin dan jalankan `BANK-NTT-TV-Setup.exe` di PC yang tersambung ke TV monitor ruang tunggu.
   - Aplikasi otomatis mendeteksi server, lalu menampilkan 6 digit kode pairing TV di layar.
   - Admin cabang membuka menu **Perangkat** di web Admin, memasukkan 6 digit kode tersebut, dan TV langsung menampilkan antrian serta mengeluarkan suara panggilan.

---

## 5. Tombol Pintas & Pengoperasian Kiosk

- **Keluar atau Mengubah Pengaturan Kiosk**:
  - Tekan kombinasi tombol: **`Ctrl + Shift + Alt + K`**
  - Masukkan PIN admin yang telah dibuat di awal.
  - Pilih **Keluar aplikasi** (untuk menutup) atau **Ubah pengaturan** (untuk mengganti printer/alamat server).
  - *Catatan keamanan: Bila salah memasukkan PIN 5 kali, layar terkunci selama 60 detik.*
- **Lupa PIN Admin Kiosk**:
  - Tutup paksa aplikasi lewat Task Manager (`Taskmgr.exe`).
  - Hapus berkas konfigurasi di:  
    `%APPDATA%\kiosk-antrian\config.json`
  - Buka kembali aplikasi untuk melakukan setup ulang.
- **Pemeriksaan Status Server di PC Kios**:
  - Buka PowerShell di PC Kios dan jalankan:
    ```powershell
    powershell -ExecutionPolicy Bypass -File "C:\Program Files\BANK NTT Ticket\resources\server\status-server.ps1"
    ```
  - Skrip ini akan memeriksa status service PostgreSQL, service web Next.js, dan port firewall.

---

## 6. Catatan Khusus untuk PC Loket Lama (IP 192.168.1.53)

Jika sebelumnya PC loket 192.168.1.53 disetup secara manual (misalnya menggunakan shortcut browser Chrome kiosk mode, script bat, atau service lama):
1. **Hentikan dan bersihkan setup lama**:
   - Hapus script autostart browser dari folder Startup (`Win + R` → `shell:startup`).
   - Matikan service manual atau Node lokal jika ada.
2. **Pasang aplikasi resmi**:
   - Cukup pasang **`BANK-NTT-Loket-Setup.exe`**.
   - Aplikasi baru akan otomatis terdaftar di autostart Windows, otomatis mendeteksi server PC Kios, dan tidak saling bentrok dengan browser bawaan.
