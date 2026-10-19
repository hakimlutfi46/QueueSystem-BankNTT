import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Load logo as base64
const logoPath = path.join(rootDir, "public", "brand", "Logo_Bank_NTT.png");
let logoBase64 = "";
if (fs.existsSync(logoPath)) {
  logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
}

const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Panduan Testing Produksi Sistem Antrian BANK NTT di Windows</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 16mm 20mm 16mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      color: #1e293b;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    /* Cover Page */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      padding: 25mm 10mm 15mm 10mm;
      position: relative;
    }

    .cover-top {
      text-align: center;
    }

    .cover-logo {
      height: 85px;
      margin-bottom: 30px;
    }

    .cover-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 700;
      font-size: 9pt;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 16px;
      border-radius: 999px;
      margin-bottom: 24px;
      border: 1px solid #bae6fd;
    }

    .cover-title {
      font-size: 25pt;
      font-weight: 800;
      color: #0b2341;
      line-height: 1.25;
      margin: 0 0 16px 0;
      letter-spacing: -0.5px;
    }

    .cover-subtitle {
      font-size: 12.5pt;
      color: #475569;
      line-height: 1.5;
      max-width: 620px;
      margin: 0 auto;
    }

    .cover-divider {
      height: 6px;
      width: 140px;
      background: linear-gradient(90deg, #0b2341, #0066b3, #f59e0b);
      margin: 32px auto;
      border-radius: 3px;
    }

    .cover-features {
      display: flex;
      justify-content: center;
      gap: 14px;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .feature-chip {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 8.5pt;
      font-weight: 600;
      color: #334155;
    }

    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 8.5pt;
      color: #64748b;
    }

    .cover-footer-left strong {
      display: block;
      color: #0b2341;
      font-size: 10pt;
      margin-bottom: 2px;
    }

    /* Headings */
    h1, h2, h3, h4 {
      color: #0b2341;
      font-weight: 700;
      page-break-after: avoid;
    }

    h1 {
      font-size: 16pt;
      border-bottom: 2px solid #0066b3;
      padding-bottom: 6px;
      margin-top: 28px;
      margin-bottom: 14px;
    }

    .section-heading {
      font-size: 15pt;
      background: #0b2341;
      color: #ffffff;
      padding: 9px 15px;
      border-radius: 6px;
      margin-top: 32px;
      margin-bottom: 16px;
      page-break-before: always;
    }

    .section-heading:first-of-type {
      page-break-before: avoid;
    }

    h2 {
      font-size: 12.5pt;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #0066b3;
    }

    h3 {
      font-size: 11pt;
      margin-top: 16px;
      margin-bottom: 8px;
      color: #0b2341;
    }

    p {
      margin-top: 0;
      margin-bottom: 10px;
      text-align: justify;
    }

    /* Lists */
    ul, ol {
      margin-top: 4px;
      margin-bottom: 12px;
      padding-left: 24px;
    }

    li {
      margin-bottom: 5px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px 0;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }

    th {
      background: #0b2341;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #0b2341;
    }

    td {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Callout Boxes */
    .callout {
      border-left: 4px solid #0066b3;
      background: #f0f7fc;
      padding: 10px 14px;
      margin: 12px 0 16px 0;
      border-radius: 0 6px 6px 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    .callout.tip {
      border-left-color: #10b981;
      background: #f0fdf4;
    }

    .callout.warning {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .callout.danger {
      border-left-color: #ef4444;
      background: #fef2f2;
    }

    .callout-title {
      font-weight: 700;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .callout.tip .callout-title { color: #047857; }
    .callout.warning .callout-title { color: #b45309; }
    .callout.danger .callout-title { color: #b91c1c; }
    .callout .callout-title { color: #0369a1; }

    /* Code & Keyboard */
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 8.5pt;
      color: #0f172a;
    }

    kbd {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-bottom: 2px solid #94a3b8;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 8pt;
      font-weight: 600;
      color: #0f172a;
      display: inline-block;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 8.5pt;
      line-height: 1.45;
      overflow-x: auto;
      margin: 12px 0 16px 0;
      page-break-inside: avoid;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }

    /* Diagram Box */
    .diagram-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
      margin: 14px 0;
      font-family: monospace;
      font-size: 8pt;
      line-height: 1.35;
      page-break-inside: avoid;
      white-space: pre;
      overflow-x: auto;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-navy { background: #0b2341; color: #ffffff; }
    .badge-sky { background: #e0f2fe; color: #0369a1; }
    .badge-orange { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }

    /* Steps */
    .step-list {
      list-style: none;
      padding: 0;
      margin: 14px 0;
    }

    .step-item {
      display: flex;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }

    .step-number {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #0066b3;
      color: white;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .step-content {
      flex: 1;
      padding-top: 2px;
    }

    .step-title {
      font-weight: 700;
      color: #0b2341;
      margin-bottom: 2px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin: 12px 0;
      page-break-inside: avoid;
    }

    .card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card-title {
      font-weight: 700;
      color: #0b2341;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>

  <!-- HALAMAN SAMPUL (COVER) -->
  <div class="cover-page">
    <div class="cover-top">
      ${logoBase64 ? `<img src="${logoBase64}" class="cover-logo" alt="Bank NTT">` : ""}
      <div><span class="cover-badge">Dokumen Panduan Teknis &amp; Pengujian</span></div>
      <h1 class="cover-title">PANDUAN TESTING PRODUKSI SISTEM ANTRIAN BANK NTT DI WINDOWS</h1>
      <p class="cover-subtitle">
        Prosedur Pengujian Menyeluruh di Lingkungan PC / Laptop Windows Menggunakan Paket Instalasi Produksi (Standalone Offline &amp; Auto-Discovery LAN)
      </p>
      <div class="cover-divider"></div>

      <div class="cover-features">
        <div class="feature-chip">✓ Pengujian Multi-PC Windows 10/11</div>
        <div class="feature-chip">✓ Otomasi Windows Services</div>
        <div class="feature-chip">✓ Skenario Simulasi 4 Aplikasi</div>
        <div class="feature-chip">✓ Pembersihan Basis Data Fresh</div>
      </div>
    </div>

    <div class="cover-footer">
      <div class="cover-footer-left">
        <strong>PT. BANK PEMBANGUNAN DAERAH NUSA TENGGARA TIMUR</strong>
        <span>Divisi Teknologi Informasi &amp; Tim Implementasi Kantor Cabang</span>
      </div>
      <div style="text-align: right;">
        <strong>Dokumen Pengujian Lapangan</strong>
        <span>Versi Produksi Windows · 2026</span>
      </div>
    </div>
  </div>

  <!-- BAGIAN 1 -->
  <div class="section-heading">1. PAKET INSTALLER YANG TERSEDIA (downloads/windows/)</div>

  <p>
    Seluruh paket instalasi aplikasi produksi siap pakai telah dibuild khusus untuk lingkungan Windows 64-bit dan tersimpan rapi di dalam direktori <code>downloads/windows/</code>.
  </p>

  <table>
    <thead>
      <tr>
        <th style="width: 32%;">File Installer</th>
        <th style="width: 13%;">Ukuran</th>
        <th style="width: 25%;">Target Penggunaan</th>
        <th>Keterangan Teknis &amp; Komponen</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong><code>BANK-NTT-Ticket-Server-Setup.exe</code></strong></td>
        <td>~182 MB</td>
        <td><strong>PC Mesin Tiket Utama</strong></td>
        <td>Paket Server Lengkap: Memasang Kiosk Tiket + Database PostgreSQL Lokal Mandiri + Windows Service Server Antrian + Konfigurasi Izin Firewall otomatis.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-Ticket-Setup.exe</code></strong></td>
        <td>~106 MB</td>
        <td>Kiosk Tiket Tambahan</td>
        <td>Aplikasi antarmuka Kiosk Tiket saja (digunakan bila kantor cabang mengoperasikan lebih dari 1 unit mesin tiket).</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-Loket-Setup.exe</code></strong></td>
        <td>~106 MB</td>
        <td>PC Petugas (Teller / CS)</td>
        <td>Aplikasi meja kerja pemanggil antrian, tombol aksi panggilan, dan timer pelayanan nasabah.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-TV-Setup.exe</code></strong></td>
        <td>~106 MB</td>
        <td>PC / Mini PC Layar TV</td>
        <td>Aplikasi monitor ruang tunggu nasabah, animasi nomor berkedip, running text dinamis, dan pemutar audio panggilan otomatis.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-Admin-Setup.exe</code></strong></td>
        <td>~106 MB</td>
        <td>PC Supervisor / Pimpinan</td>
        <td>Aplikasi panel kontrol manajemen loket, layanan, akun petugas, status aktif/nonaktif switcher, serta unduh laporan Excel.</td>
      </tr>
    </tbody>
  </table>

  <!-- BAGIAN 2 -->
  <div class="section-heading">2. KEBUTUHAN SISTEM &amp; JARINGAN KANTOR CABANG</div>

  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Sistem Operasi Komputer</div>
        Dapat dijalankan pada komputer dengan sistem operasi <strong>Windows 10 (64-bit)</strong> atau <strong>Windows 11 (64-bit)</strong>, RAM minimum 4 GB (disarankan 8 GB untuk PC server mesin tiket).
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Konektivitas Jaringan Lokal (LAN / Wi-Fi)</div>
        Semua PC yang diuji coba (Server/Mesin Tiket, PC Loket Petugas, PC Layar TV, dan PC Admin) harus berada di dalam <strong>subnet jaringan LAN (kabel) atau Wi-Fi yang sama</strong>.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Pengaturan Profil Jaringan Windows (Private Network)</div>
        Profil jaringan Windows pada seluruh komputer wajib diatur ke <strong>Private Network</strong> (bukan <em>Public Network</em>). Hal ini sangat krusial agar fitur <em>LAN Auto-Discovery (UDP 41234)</em> tidak diblokir oleh Windows Defender Firewall.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">4</div>
      <div class="step-content">
        <div class="step-title">Bebas Ketergantungan Eksternal (100% Offline Standalone)</div>
        Komputer kantor cabang <strong>tidak memerlukan koneksi internet publik</strong>, tidak perlu install Node.js, npm, Docker, Python, ataupun database manual. Seluruh mesin database dan runtime server telah terpaket mandiri di dalam installer.
      </div>
    </div>
  </div>

  <div class="callout warning">
    <div class="callout-title">⚠️ Perhatian Pengaturan Profil Private Network</div>
    Jika komputer berada pada profil "Public Network", Windows Defender Firewall secara otomatis memblokir paket UDP siaran (*broadcast*). Akibatnya aplikasi Loket dan TV tidak dapat menemukan IP server secara otomatis. Selalu ubah ke <strong>Private Network</strong> di: <em>Settings &rarr; Network &amp; Internet &rarr; Status &rarr; Properties &rarr; Private</em>.
  </div>

  <!-- BAGIAN 3 -->
  <div class="section-heading">3. LANGKAH 1: INSTALASI SERVER &amp; KIOSK DI PC UTAMA (MESIN TIKET)</div>

  <p>
    Komputer di dalam mesin Kiosk Tiket utama bertindak sebagai pusat pengendali (Server Antrian) dan layar sentuh nasabah:
  </p>

  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Persiapan File Installer</div>
        Salin file <strong><code>BANK-NTT-Ticket-Server-Setup.exe</code></strong> dari folder <code>downloads/windows/</code> ke PC utama mesin tiket (menggunakan flashdisk atau media transfer lokal).
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Eksekusi Hak Administrator</div>
        Klik kanan file <strong><code>BANK-NTT-Ticket-Server-Setup.exe</code></strong> &rarr; pilih <strong>Run as administrator</strong>. Tindakan ini wajib agar installer berhak mendaftarkan layanan Windows Service dan membuka port firewall.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Proses Wizard Otomatis</div>
        Ikuti petunjuk pada layar hingga wizard instalasi selesai. Installer secara otomatis:
        <ul>
          <li>Memasang database PostgreSQL mandiri (Windows Service: <code>BankNTT-PostgreSQL</code>).</li>
          <li>Memasang backend server antrian sebagai background service (Windows Service: <code>BankNTT-Server</code>).</li>
          <li>Mendaftarkan aturan inbound firewall untuk port <strong>TCP 3000</strong> (Web Socket &amp; HTTP) dan <strong>UDP 41234</strong> (Auto-Discovery).</li>
          <li>Menjalankan aplikasi <strong>BANK NTT Ticket</strong> di layar.</li>
        </ul>
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">4</div>
      <div class="step-content">
        <div class="step-title">Verifikasi Siap Pakai &amp; Auto-Start</div>
        Layar sentuh mesin tiket langsung aktif menampilkan pilihan layanan Bank NTT (Customer Service &amp; Teller). Setiap kali PC mesin tiket dinyalakan kembali saat buka kantor pagi hari, server dan kiosk akan langsung berjalan otomatis (*auto-start*) tanpa perlu tindakan teknis apa pun.
      </div>
    </div>
  </div>

  <!-- BAGIAN 4 -->
  <div class="section-heading">4. LANGKAH 2: PEMASANGAN APLIKASI DI PC LOKET, TV, DAN ADMIN</div>

  <p>
    Salin file installer klien yang relevan ke komputer masing-masing meja kerja:
  </p>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">🖥️ A. PC Layar TV Ruang Tunggu</div>
      <ol style="margin: 0; padding-left: 18px; font-size: 8.5pt;">
        <li>Jalankan file <strong><code>BANK-NTT-TV-Setup.exe</code></strong>.</li>
        <li>Buka aplikasi <strong>BANK NTT TV</strong>.</li>
        <li><strong>Auto-Pairing Cerdas</strong>: Aplikasi TV langsung memindai jaringan lokal secara otomatis &rarr; menemukan IP PC mesin tiket &rarr; terhubung dan menampilkan monitor antrian beserta suara bel audio tanpa perlu input kode pairing ataupun PIN.</li>
      </ol>
    </div>

    <div class="card">
      <div class="card-title">👨‍💼 B. PC Meja Petugas (CS &amp; Teller)</div>
      <ol style="margin: 0; padding-left: 18px; font-size: 8.5pt;">
        <li>Jalankan file <strong><code>BANK-NTT-Loket-Setup.exe</code></strong>.</li>
        <li>Buka aplikasi <strong>BANK NTT Loket</strong>.</li>
        <li>Aplikasi otomatis terhubung ke server dan langsung menyajikan layar Login Petugas.</li>
      </ol>
    </div>
  </div>

  <div class="card" style="margin-top: 14px;">
    <div class="card-title">🔐 C. PC Admin / Supervisor Cabang</div>
    <p style="font-size: 8.5pt; margin-bottom: 6px;">
      Jalankan file <strong><code>BANK-NTT-Admin-Setup.exe</code></strong> pada komputer Supervisor atau Kepala Cabang (atau buka browser Google Chrome / Microsoft Edge lalu akses alamat IP server, contoh: <code>http://192.168.1.50:3000/admin</code>).
    </p>
    <p style="font-size: 8.5pt; margin: 0;">
      Gunakan kredensial akun bawaan:
      <br>• <strong>Username</strong>: <code>admin</code>
      <br>• <strong>Password</strong>: <code>admin123</code> <em>(atau password baru jika telah diubah saat registrasi awal)</em>.
    </p>
  </div>

  <!-- BAGIAN 5 -->
  <div class="section-heading">5. LANGKAH 3: SKENARIO PENGUJIAN ALUR ANTRIAN LENGKAP</div>

  <p>
    Lakukan uji coba berurutan berikut untuk memverifikasi seluruh komponen bekerja sinkron secara *real-time*:
  </p>

  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Skenario 1: Pengambilan Tiket di Mesin Kiosk</div>
        Sentuh salah satu tombol layanan di layar mesin tiket:
        <ul>
          <li>Sentuh <strong>Customer Service</strong> &rarr; tiket tercetak dengan nomor <strong>A001</strong>.</li>
          <li>Sentuh <strong>Teller</strong> &rarr; tiket tercetak dengan nomor <strong>B001</strong>.</li>
        </ul>
        Struk fisik keluar melalui printer thermal (atau tersimpan sebagai dokumen PDF pada sistem jika printer thermal belum dikoneksikan).
      </div>
    </div>

    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Skenario 2: Buka Loket &amp; Pemanggilan Antrian</div>
        Pada PC Loket Petugas:
        <ul>
          <li>Login dengan user petugas (atau admin).</li>
          <li>Pilih meja kerja (contoh: <strong>Loket 1</strong>), lalu klik tombol <strong>"Buka Loket"</strong>.</li>
          <li>Layar loket menampilkan jumlah antrian yang sedang menunggu (misal: <em>A001 menunggu</em>).</li>
          <li>Tekan tombol <strong>"Panggil Antrian Berikutnya"</strong> (atau tekan tombol <kbd>Spasi</kbd> pada keyboard).</li>
        </ul>
      </div>
    </div>

    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Skenario 3: Verifikasi Layar TV &amp; Panggilan Suara</div>
        Saat petugas menekan tombol panggil:
        <ul>
          <li>Pada Layar TV ruang tunggu, kotak <strong>Loket 1</strong> berkedip cerah menampilkan nomor <strong>A001</strong>.</li>
          <li>Bel lonceng nada ganda berbunyi, disusul pemanggilan suara otomatis berbahasa Indonesia di speaker TV:
            <div class="callout tip" style="margin: 6px 0;">
              <em>"Nomor antrian... A... 0... 0... 1... menuju ke loket... 1"</em>
            </div>
          </li>
          <li>Running text selamat datang dan jam operasional cabang bergerak lancar di bagian bawah layar TV.</li>
        </ul>
      </div>
    </div>

    <div class="step-item">
      <div class="step-number">4</div>
      <div class="step-content">
        <div class="step-title">Skenario 4: Penyelesaian Layanan &amp; Verifikasi Laporan</div>
        <ul>
          <li>Di layar Loket, klik <strong>"Mulai Layanan"</strong> saat nasabah tiba di meja, lalu klik <strong>"Selesai Layanan"</strong> (atau tombol <kbd>D</kbd>) saat transaksi selesai.</li>
          <li>Buka PC Admin &rarr; menu <strong>Laporan Harian</strong>:
            <br>Tiket <strong>A001</strong> tercatat rapi memuat waktu ambil tiket, waktu tunggu, durasi pelayanan, nama staf loket, dan status selesai. Laporan dapat langsung diunduh ke format Excel (<code>.xlsx</code>).
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- BAGIAN 6 -->
  <div class="section-heading">6. PEMERIKSAAN STATUS &amp; TROUBLESHOOTING DI WINDOWS</div>

  <h2>1. Memeriksa Layanan Background Service Windows</h2>
  <p>
    Bila ingin memverifikasi bahwa server antrian dan database berjalan aktif di latar belakang PC utama:
  </p>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        Tekan kombinasi tombol <kbd>Windows</kbd> + <kbd>R</kbd> pada keyboard.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        Ketik <code>services.msc</code> lalu tekan <kbd>Enter</kbd>.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        Cari dua layanan berikut dan pastikan statusnya:
        <ul>
          <li><strong><code>BankNTT-PostgreSQL</code></strong>: Status wajib <strong>Running</strong> (Startup type: Automatic).</li>
          <li><strong><code>BankNTT-Server</code></strong>: Status wajib <strong>Running</strong> (Startup type: Automatic).</li>
        </ul>
        Jika belum berjalan, klik kanan pada layanan tersebut &rarr; pilih <strong>Start</strong>.
      </div>
    </div>
  </div>

  <h2>2. Menutup atau Keluar dari Aplikasi Kiosk dan TV</h2>
  <p>
    Aplikasi Kiosk dan TV dirancang berjalan dalam mode layar penuh (Full Screen / Kiosk Mode):
  </p>
  <ul>
    <li><strong>Keluar dari Aplikasi Kiosk</strong>: Tekan tombol <kbd>Alt</kbd> + <kbd>F4</kbd> (atau <kbd>Ctrl</kbd> + <kbd>Q</kbd>).</li>
    <li><strong>Keluar dari Aplikasi TV</strong>: Tekan tombol <kbd>Alt</kbd> + <kbd>F4</kbd>. Untuk membuka modal konfigurasi IP manual pada TV, tekan kombinasi tombol <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>K</kbd>.</li>
  </ul>

  <h2>3. Solusi Jika Klien Tidak Menemukan Server (Discovery Gagal)</h2>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Uji Koneksi Dasar (Ping)</div>
        Buka Command Prompt (<kbd>cmd</kbd>) di PC klien dan jalankan perintah <code>ping &lt;IP_SERVER&gt;</code> (contoh: <code>ping 192.168.1.50</code>). Pastikan respon berstatus <em>Reply</em>.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Verifikasi Profil Jaringan Private</div>
        Pastikan kedua PC berada pada profil jaringan <strong>Private Network</strong> agar port siaran UDP 41234 diizinkan oleh Windows Defender Firewall.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Input Alamat IP Manual</div>
        Bila switch jaringan kantor cabang memblokir paket broadcast UDP, Anda dapat memasukkan alamat IP server secara manual pada form pengaturan klien (misal: <code>http://192.168.1.50:3000</code>).
      </div>
    </div>
  </div>

  <!-- BAGIAN 7 -->
  <div class="section-heading">7. RESET DATABASE FRESH PASCA-TESTING (KONDISI PABRIK)</div>

  <p>
    Setelah seluruh tahapan simulasi dan uji coba berhasil diverifikasi, bersihkan seluruh data transaksi testing agar saat hari peresmian operasional tiba, sistem berada dalam kondisi <strong>bersih 100%</strong>:
  </p>

  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        Buka folder server antrian di PC Windows (atau folder root sistem antrian).
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        Klik ganda file eksekusi:
        <br>👉 <strong><code>Reset-Database-Fresh-Windows.bat</code></strong>
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        Jendela command prompt akan terbuka menanyakan konfirmasi. Ketik huruf <kbd>Y</kbd> lalu tekan <kbd>Enter</kbd>.
      </div>
    </div>
  </div>

  <div class="callout tip">
    <div class="callout-title">✅ Garansi Keamanan Hasil Eksekusi Reset Database:</div>
    <ul>
      <li>Seluruh tiket uji coba dan event log riwayat panggilan <strong>terhapus tuntas (0 antrian)</strong>.</li>
      <li>Nomor urut antrian hari ini otomatis kembali ke awal (<strong>001</strong>).</li>
      <li>Status seluruh loket kembali ke kondisi <strong>CLOSED</strong> (Tertutup).</li>
      <li>Data master penting cabang (Akun Admin <code>admin</code> / <code>Password123</code>, konfigurasi layanan, data loket, dan identitas kantor cabang) <strong>tetap utuh, aman, dan siap menyambut nasabah resmi</strong>.</li>
    </ul>
  </div>

</body>
</html>
`;

async function generateTestingPdf() {
  console.log("Memulai pembuatan PDF Panduan Testing Windows...");
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.setContent(htmlContent, {
    waitUntil: "networkidle",
  });

  const outputFiles = [
    path.join(rootDir, "PANDUAN-TESTING-WINDOWS.pdf"),
    path.join(rootDir, "docs", "PANDUAN-TESTING-WINDOWS.pdf"),
    path.join(rootDir, "downloads", "windows", "PANDUAN-TESTING-WINDOWS.pdf"),
  ];

  // Header & Footer templates for print
  const headerTemplate = `
    <div style="font-size: 8pt; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 16mm; font-family: -apple-system, sans-serif;">
      <span>Sistem Antrian Bank NTT · Panduan Testing Produksi Windows</span>
      <span>Dokumen Teknis Kantor Cabang</span>
    </div>
  `;

  const footerTemplate = `
    <div style="font-size: 8pt; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 16mm; font-family: -apple-system, sans-serif;">
      <span>PT. Bank Pembangunan Daerah Nusa Tenggara Timur</span>
      <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
    </div>
  `;

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "22mm",
      bottom: "22mm",
      left: "16mm",
      right: "16mm",
    },
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
  });

  for (const file of outputFiles) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, pdfBuffer);
    console.log(`✓ PDF berhasil disimpan di: ${file} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  }

  await browser.close();
  console.log("Selesai! Seluruh PDF Panduan Testing Windows berhasil dibuat.");
}

generateTestingPdf().catch((err) => {
  console.error("Gagal membuat PDF:", err);
  process.exit(1);
});
