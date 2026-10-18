# Panduan Setup: 1 PC Windows (Server) + 2 MacBook (Klien)

Dokumen ini menjelaskan cara menjalankan **Sistem Antrean Bank NTT** dengan arsitektur:
- **1 PC Windows** sebagai **Tiket Server** (Database & Engine Utama).
- **MacBook 1** sebagai **Loket Petugas** dan **Admin**.
- **MacBook 2** sebagai **TV Display Layar Antrean & Suara Panggilan**.
- Semua perangkat terhubung dalam **1 jaringan Wi-Fi / LAN yang sama**.

---

## 1. Persiapan Jaringan & IP PC Windows (Server)

1. Hubungkan **PC Windows** dan **kedua MacBook** ke Wi-Fi / Router / Hotspot yang sama.
2. Di **PC Windows**, cari IP lokalnya:
   - Buka **Command Prompt (CMD)**, ketik:
     ```cmd
     ipconfig
     ```
   - Catat nilai **IPv4 Address** (contoh: `192.168.1.50`).
3. **Buka Port 3000 di Windows Defender Firewall** (wajib agar MacBook bisa akses):
   - Buka **PowerShell sebagai Administrator**, lalu jalankan perintah:
     ```powershell
     New-NetFirewallRule -DisplayName "Bank NTT Antrean Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
     ```

---

## 2. Menjalankan Tiket Server di PC Windows

1. Jalankan server antrean di PC Windows:
   - **Menggunakan Installer**: Buka aplikasi `BANK-NTT-Ticket-Server-Setup.exe` (atau shortcut Server di desktop).
   - **Atau via CMD / Terminal proyek**:
     ```cmd
     npm run start
     ```
2. Pastikan di konsol muncul:
   ```text
   ▲ Next.js
   - Local:    http://localhost:3000
   - Network:  http://0.0.0.0:3000
   ```
3. Server siap menerima koneksi dari seluruh laptop di jaringan lokal.

---

## 3. Pengaturan di MacBook 1 (Loket Petugas & Admin)

Ganti `192.168.1.50` dengan IP PC Windows Anda.

### A. Loket Petugas (Counter)
1. Buka browser (Google Chrome / Safari) di MacBook 1.
2. Akses alamat:
   ```text
   http://192.168.1.50:3000/counter
   ```
3. Login menggunakan akun staff:
   - **Username**: `staff1`
   - **Password**: `password123`
4. Pilih loket (misalnya **Loket 1**), lalu klik **Buka Loket**.

### B. Admin Dashboard
1. Buka tab baru di browser MacBook 1:
   ```text
   http://192.168.1.50:3000/admin
   ```
2. Login admin:
   - **Username**: `admin`
   - **Password**: `admin123`
3. Di sini Anda bisa mengelola daftar layanan, nomor loket, dan memantau antrean.

*(Catatan: Anda juga dapat menggunakan aplikasi native Mac `BANK-NTT-Loket-Setup.dmg` dan `BANK-NTT-Admin-Setup.dmg` di folder `downloads/mac/`).*

---

## 4. Pengaturan di MacBook 2 (TV Display & Suara Panggilan)

MacBook 2 difungsikan untuk memutar video promosi/informasi, menampilkan panggilan nomor antrean, dan membunyikan suara pengumuman (chime & voice).

### A. Membuka TV Display di Browser:
1. Buka browser Google Chrome di MacBook 2.
2. Akses alamat:
   ```text
   http://192.168.1.50:3000/tv
   ```
   *(atau `http://192.168.1.50:3000/display`)*
3. **Penting**: Klik 1x di sembarang area layar agar browser mengizinkan audio otomatis berbunyi.
4. Tekan tombol Fullscreen browser (`Cmd + Shift + F` atau ikon Fullscreen).

### B. Opsi Native App (Disarankan untuk TV):
1. Buka folder `downloads/mac/` dan install **`BANK-NTT-TV-Setup.dmg`**.
2. Masukkan URL server: `http://192.168.1.50:3000`.
3. Aplikasi TV akan langsung fullscreen dan memutar suara bel panggilan secara otomatis tanpa perlu interaksi klik.

---

## 5. Simulasi Pengujian Panggilan (Testing Antrean)

1. **Ambil Tiket**:
   - Buka halaman Kiosk tiket di browser MacBook (atau lewat smartphone di Wi-Fi yang sama):
     ```text
     http://192.168.1.50:3000/kiosk
     ```
   - Tekan tombol layanan: **Teller (A)**, **Customer Service (B)**, atau layanan **C - J**.
   - Tiket antrean baru berhasil tercetak di layar.
2. **Panggil Antrean di MacBook 1**:
   - Di layar Loket Petugas (`/counter`), klik tombol **"Panggil Berikutnya"**.
3. **Hasil di MacBook 2 (TV)**:
   - Layar TV menampilkan animasi pemanggilan tiket dan nomor loket tujuan.
   - Suara bel chime berbunyi, diikuti suara vokal wanita:
     *"Nomor antrian B, satu. Silakan menuju loket CS satu."*

---

## 6. Reset Database Fresh (Membersihkan Data Testing Sebelum Live)

Setelah selesai melakukan testing dan Anda ingin membersihkan seluruh data tiket uji coba agar sistem siap dipakai resmi oleh nasabah/cabang:

### Di PC Windows (Server):
- Cukup **double-click** file:
  👉 **`Reset-Database-Fresh-Windows.bat`**
- Ketik `Y` lalu tekan Enter saat diminta konfirmasi.

### Di MacBook (Bila Server berjalan di Mac):
- Cukup **double-click** file:
  👉 **`Reset-Database-Fresh-Mac.command`**
  *(atau jalankan `npm run db:reset:fresh` dari Terminal)*.

### Apa yang Terjadi Saat Di-reset?
- Seluruh tiket uji coba dan riwayat panggilan **terhapus bersih total (0 tiket)**.
- Nomor urut antrian hari ini otomatis di-reset ke awal (nomor berikutnya pasti **A001**, **B001**, dst).
- Sesi loket petugas di-reset ke status **CLOSED**.
- Data konfigurasi cabang, akun Admin (`admin` / `Password123`), dan layanan default tetap utuh dan siap pakai.

