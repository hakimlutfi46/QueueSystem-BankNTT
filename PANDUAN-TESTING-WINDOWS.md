# Panduan Testing Produksi Sistem Antrian BANK NTT di Windows

Dokumen ini memandu pengujian menyeluruh sistem antrian BANK NTT di lingkungan PC / Laptop Windows menggunakan paket instalasi produksi yang ada di folder [`downloads/windows/`](downloads/windows/).

---

## 1. Paket Installer yang Tersedia (`downloads/windows/`)

| File Installer | Ukuran | Target Penggunaan | Keterangan |
| :--- | :--- | :--- | :--- |
| **`BANK-NTT-Ticket-Server-Setup.exe`** | ~182 MB | **PC Mesin Tiket Utama** | Memasang Kiosk Tiket + PostgreSQL + Server Antrian (Background Windows Service) + Firewall. |
| **`BANK-NTT-Ticket-Setup.exe`** | ~106 MB | Kiosk Tiket Tambahan | Hanya aplikasi kiosk tiket (bila cabang memiliki lebih dari 1 mesin tiket). |
| **`BANK-NTT-Loket-Setup.exe`** | ~106 MB | PC Petugas (Teller / CS) | Aplikasi pemanggil antrian untuk petugas loket. |
| **`BANK-NTT-TV-Setup.exe`** | ~106 MB | PC / Mini PC Layar TV | Aplikasi tampilan layar monitor antrian ruang tunggu dengan audio pemanggilan. |
| **`BANK-NTT-Admin-Setup.exe`** | ~106 MB | PC Supervisor / Pimpinan | Aplikasi panel kontrol manajemen layanan, loket, perangkat, dan laporan. |

---

## 2. Kebutuhan Sistem & Jaringan

1. **Sistem Operasi**: Windows 10 atau Windows 11 (64-bit).
2. **Koneksi Jaringan**:
   * Semua PC (Server/Tiket, Loket, TV, Admin) harus berada di **jaringan LAN (kabel) atau Wi-Fi yang sama**.
   * **PENTING**: Profil jaringan Windows harus diatur ke **Private Network** (bukan *Public Network*), agar fitur *LAN Discovery* (UDP 41234) tidak diblokir oleh Windows Defender Firewall.
3. **Tanpa Ketergantungan Eksternal**:
   * Komputer cabang **tidak memerlukan internet, Node.js, npm, Docker, ataupun instalasi manual database**. Semua sudah dibundle mandiri (*standalone offline*).

---

## 3. Langkah 1: Instalasi Server & Kiosk di PC Utama (Mesin Tiket)

1. Salin file **`BANK-NTT-Ticket-Server-Setup.exe`** ke PC utama di dalam mesin tiket (misalnya via flashdisk).
2. Klik kanan file tersebut &rarr; pilih **Run as administrator**.
3. Ikuti wizard instalasi sampai selesai.
4. **Yang otomatis dikerjakan installer:**
   * Memasang database PostgreSQL lokal mandiri (service `BankNTT-PostgreSQL`).
   * Memasang runtime server antrian sebagai Windows Service otomatis (service `BankNTT-Server`).
   * Mendaftarkan izin firewall Windows untuk port **TCP 3000** (Web) dan **UDP 41234** (Discovery).
   * Menjalankan aplikasi **BANK NTT Ticket** secara otomatis.
5. Mesin tiket langsung menampilkan layar sentuh Kiosk Bank NTT dan siap mengeluarkan nomor antrian.
6. **Catatan Auto-Start**: Setiap kali PC mesin tiket dinyalakan kembali (misal saat buka kantor di pagi hari), server antrian dan kiosk akan langsung berjalan otomatis tanpa perlu perintah manual apa pun.

---

## 4. Langkah 2: Pemasangan Aplikasi di PC Loket, TV, dan Admin

Pindahkan installer klien dari folder `downloads/windows/` ke masing-masing PC:

### A. Di PC Layar TV Ruang Tunggu:
1. Jalankan **`BANK-NTT-TV-Setup.exe`**.
2. Buka aplikasi **BANK NTT TV**.
3. **Auto-Pairing**: Aplikasi TV akan memindai jaringan lokal secara otomatis &rarr; menemukan IP server mesin tiket &rarr; langsung terhubung dan menampilkan layar monitor antrian. Tidak perlu input kode pairing ataupun PIN.

### B. Di PC Meja Petugas (Teller / CS):
1. Jalankan **`BANK-NTT-Loket-Setup.exe`**.
2. Buka aplikasi **BANK NTT Loket**.
3. Aplikasi otomatis terhubung ke server dan menampilkan layar Login Petugas.

### C. Di PC Admin / Pimpinan:
1. Jalankan **`BANK-NTT-Admin-Setup.exe`** (atau cukup buka browser Chrome/Edge dan ketik alamat IP server, contoh: `http://192.168.1.50:3000/admin`).
2. Login dengan akun bawaan:
   * **Username**: `admin`
   * **Password**: `admin123` *(atau password baru jika sudah diganti)*.

---

## 5. Langkah 3: Skenario Pengujian Alur Antrian

Lakukan pengujian berurutan untuk memverifikasi seluruh komponen bekerja sinkron:

### Skenario 1: Pengambilan Tiket di Kiosk
1. Pada layar mesin tiket, sentuh salah satu layanan:
   * **Customer Service** &rarr; tiket tercetak dengan nomor **A001**.
   * **Teller** &rarr; tiket tercetak dengan nomor **B001**.
2. Struk tiket fisik akan tercetak melalui printer thermal (atau tersimpan sebagai PDF jika printer belum terpasang).

### Skenario 2: Buka Loket & Pemanggilan Antrian
1. Di PC Loket (Petugas):
   * Login dengan user admin (atau akun staf loket).
   * Pilih loket yang digunakan (contoh: **Loket 1**), lalu klik **Buka Loket**.
   * Di layar loket akan muncul informasi antrian yang sedang menunggu (misal: *A001 menunggu*).
2. Klik tombol **"Panggil Antrian Berikutnya"**.

### Skenario 3: Verifikasi Layar TV & Panggilan Suara
1. Saat petugas menekan tombol panggil:
   * Pada Layar TV ruang tunggu, kotak **Loket 1** akan berkedip menampilkan nomor **A001**.
   * Suara bel *ding-dong* dan pemanggilan otomatis berbahasa Indonesia akan berbunyi di speaker TV:
     > *"Nomor antrian... A... 0... 0... 1... menuju ke loket... 1"*
2. Layar TV juga menampilkan running text selamat datang dan jam operasional cabang secara *real-time*.

### Skenario 4: Penyelesaian Layanan & Laporan
1. Di layar Loket, klik **"Mulai Layanan"** saat nasabah tiba di meja loket.
2. Setelah transaksi selesai, klik **"Selesai Layanan"**.
3. Buka panel Admin &rarr; menu **Laporan Harian**:
   * Tiket **A001** tercatat rapi beserta waktu tunggu, waktu pelayanan, dan nama petugas loket.
   * Laporan dapat langsung diexport ke format Excel (.xlsx).

---

## 6. Pemeriksaan Status & Troubleshooting di Windows

### Memeriksa Layanan Server Windows
Jika ingin memeriksa apakah background service server antrian aktif di PC utama:
1. Tekan tombol `Windows + R`, ketik `services.msc`, lalu tekan Enter.
2. Cari dua layanan berikut:
   * **`BankNTT-PostgreSQL`**: Status harus *Running* (Otomatis).
   * **`BankNTT-Server`**: Status harus *Running* (Otomatis).
3. Jika status belum *Running*, klik kanan &rarr; pilih **Start**.

### Menutup / Keluar dari Aplikasi Kiosk atau TV
* **Aplikasi Kiosk**: Tekan tombol `Alt + F4` (atau `Ctrl + Q`).
* **Aplikasi TV**: Tekan tombol `Alt + F4` (atau `Ctrl + Shift + Alt + K` untuk membuka pengaturan).

### Jika Klien Tidak Menemukan Server (Discovery Gagal)
1. Pastikan kedua PC bisa saling `ping` di command prompt (`ping <IP_SERVER>`).
2. Pastikan tipe jaringan diatur ke **Private**:
   * Buka *Settings* &rarr; *Network & Internet* &rarr; *Wi-Fi / Ethernet* &rarr; pilih **Private network**.
3. Anda juga dapat memasukkan alamat IP server secara manual pada form pengaturan klien jika broadcast UDP diblokir oleh switch router kantor.
