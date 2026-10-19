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
  <title>Buku Panduan Sistem Antrian Bank NTT</title>
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
      font-size: 26pt;
      font-weight: 800;
      color: #0b2341;
      line-height: 1.25;
      margin: 0 0 16px 0;
      letter-spacing: -0.5px;
    }

    .cover-subtitle {
      font-size: 13pt;
      color: #475569;
      line-height: 1.5;
      max-width: 600px;
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
      gap: 16px;
      margin-top: 24px;
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

    .chapter-heading {
      font-size: 18pt;
      background: #0b2341;
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 6px;
      margin-top: 36px;
      margin-bottom: 16px;
      page-break-before: always;
    }

    .chapter-heading:first-of-type {
      page-break-before: avoid;
    }

    h2 {
      font-size: 13pt;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #0066b3;
    }

    h3 {
      font-size: 11pt;
      margin-top: 16px;
      margin-bottom: 8px;
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
      padding: 7px 10px;
      border: 1px solid #0b2341;
    }

    td {
      padding: 7px 10px;
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

    /* Code Blocks */
    pre, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 8.5pt;
      color: #0f172a;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 8pt;
      line-height: 1.45;
      overflow-x: auto;
      margin: 12px 0 16px 0;
      page-break-inside: avoid;
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

    .toc {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 28px;
      page-break-after: always;
    }

    .toc-title {
      font-size: 14pt;
      font-weight: 700;
      color: #0b2341;
      margin-bottom: 12px;
      border-bottom: 2px solid #0066b3;
      padding-bottom: 6px;
    }

    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dotted #cbd5e1;
      font-size: 9.5pt;
    }

    .toc-item strong {
      color: #0b2341;
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
      <div><span class="cover-badge">Dokumen Panduan Operasional Resmi</span></div>
      <h1 class="cover-title">BUKU PANDUAN PENGGUNAAN &amp; OPERASIONAL SISTEM ANTRIAN</h1>
      <p class="cover-subtitle">
        Pedoman Lengkap Penerapan, Pengoperasian Loket, Mesin Tiket Kiosk, Layar TV Ruang Tunggu, dan Panel Kontrol Administrasi Kantor Cabang Bank NTT
      </p>
      <div class="cover-divider"></div>

      <div class="cover-features">
        <div class="feature-chip">✓ 100% Offline Standalone</div>
        <div class="feature-chip">✓ Auto-Discovery LAN (UDP 41234)</div>
        <div class="feature-chip">✓ Auto-Start &amp; Auto-Pairing</div>
        <div class="feature-chip">✓ Windows Services Terintegrasi</div>
      </div>
    </div>

    <div class="cover-footer">
      <div class="cover-footer-left">
        <strong>PT. BANK PEMBANGUNAN DAERAH NUSA TENGGARA TIMUR</strong>
        <span>Divisi Teknologi Informasi &amp; Operasional Jaringan Kantor</span>
      </div>
      <div style="text-align: right;">
        <strong>Edisi Produksi v1.0</strong>
        <span>Tahun 2026 · Berlaku untuk Seluruh Kantor Cabang</span>
      </div>
    </div>
  </div>

  <!-- DAFTAR ISI -->
  <div class="toc">
    <div class="toc-title">DAFTAR ISI BUKU PANDUAN</div>
    <ul class="toc-list">
      <li class="toc-item"><span><strong>BAB 1</strong>. Gambaran Umum &amp; Arsitektur Sistem Cabang</span><span>Hal 3</span></li>
      <li class="toc-item"><span><strong>BAB 2</strong>. Alur Operasional Antrian Harian</span><span>Hal 4</span></li>
      <li class="toc-item"><span><strong>BAB 3</strong>. Panduan Mesin Kiosk Tiket (Nasabah)</span><span>Hal 5</span></li>
      <li class="toc-item"><span><strong>BAB 4</strong>. Panduan Layar Monitor TV Ruang Tunggu</span><span>Hal 6</span></li>
      <li class="toc-item"><span><strong>BAB 5</strong>. Panduan Petugas Loket (Customer Service &amp; Teller)</span><span>Hal 7</span></li>
      <li class="toc-item"><span><strong>BAB 6</strong>. Panduan Panel Kontrol Admin Cabang</span><span>Hal 9</span></li>
      <li class="toc-item"><span><strong>BAB 7</strong>. Panduan Pemasangan &amp; Pengujian di Lingkungan Windows</span><span>Hal 12</span></li>
      <li class="toc-item"><span><strong>BAB 8</strong>. Prosedur Perawatan, Backup, dan Reset Data Bersih</span><span>Hal 15</span></li>
      <li class="toc-item"><span><strong>BAB 9</strong>. Tanya Jawab (FAQ) &amp; Solusi Pemecahan Masalah</span><span>Hal 16</span></li>
    </ul>
  </div>

  <!-- BAB 1 -->
  <div class="chapter-heading">BAB 1: GAMBARAN UMUM &amp; ARSITEKTUR SISTEM CABANG</div>

  <p>
    Sistem Antrian Bank NTT dirancang khusus untuk memenuhi standar keandalan operasional perbankan di kantor cabang. Sistem ini beroperasi <strong>secara mandiri (standalone) di jaringan lokal (LAN / Wi-Fi)</strong> tanpa ketergantungan pada koneksi internet publik.
  </p>

  <h2>1. Topologi Jaringan Kantor Cabang</h2>
  <p>
    Satu PC di kantor cabang bertindak sebagai <strong>Server Antrian Utama</strong> (biasanya menyatu di dalam mesin Kiosk Tiket utama). Seluruh perangkat lainnya terhubung ke server ini melalui kabel LAN atau Wi-Fi cabang.
  </p>

  <div class="diagram-box">
                       ┌─────────────────────────────────────────┐
                       │     PC SERVER UTAMA (MESIN TIKET)       │
                       │  - Server Antrian Next.js (Port 3000)   │
                       │  - Database PostgreSQL Lokal Terpadu    │
                       │  - Layanan Windows Service Otomatis     │
                       └────────────────────┬────────────────────┘
                                            │ Jaringan Lokal (LAN / Switch / Wi-Fi)
            ┌───────────────────────────────┼───────────────────────────────┐
            │                               │                               │
  ┌─────────┴─────────┐           ┌─────────┴─────────┐           ┌─────────┴─────────┐
  │   LAYAR TV UTAMA  │           │   PC MEJA LOKET   │           │   PC ADMIN / PIM  │
  │ - Display antrian │           │ - Meja CS 1, CS 2 │           │ - Supervisor / BO │
  │ - Audio panggilan │           │ - Meja Teller 1-4 │           │ - Laporan harian  │
  │ - Auto-Pairing    │           │ - Panggil antrian │           │ - Atur konfigurasi│
  └───────────────────┘           └───────────────────┘           └───────────────────┘</div>

  <h2>2. Lima Komponen Utama Sistem</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 22%;">Komponen</th>
        <th style="width: 25%;">Pengguna</th>
        <th>Fungsi dan Peran Operasional</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Kiosk Tiket</strong><br><code>/kiosk</code></td>
        <td>Nasabah</td>
        <td>Layar sentuh bagi nasabah untuk memilih layanan (Customer Service / Teller) dan mencetak struk fisik nomor antrian.</td>
      </tr>
      <tr>
        <td><strong>Layar TV Monitor</strong><br><code>/display</code></td>
        <td>Nasabah di Ruang Tunggu</td>
        <td>Menampilkan nomor antrian yang sedang dipanggil, status seluruh loket buka/tutup, running text pengumuman, dan membacakan suara panggilan otomatis (*ding-dong*).</td>
      </tr>
      <tr>
        <td><strong>Layar Loket</strong><br><code>/counter</code></td>
        <td>Petugas CS &amp; Teller</td>
        <td>Antarmuka kerja petugas untuk memanggil nomor antrian berikutnya, panggilan ulang, menyelesaikan layanan, atau istirahat.</td>
      </tr>
      <tr>
        <td><strong>Panel Admin</strong><br><code>/admin</code></td>
        <td>Supervisor &amp; Pimpinan</td>
        <td>Pengaturan loket, layanan, petugas, perangkat, tampilan identitas cabang, serta pemantauan dasbor dan ekspor laporan transaksi ke Excel (.xlsx).</td>
      </tr>
      <tr>
        <td><strong>Protokol Discovery</strong><br><code>UDP 41234</code></td>
        <td>Sistem Internal</td>
        <td>Mekanisme otomatis yang membuat seluruh PC klien (TV, Loket, Admin) langsung menemukan IP Server tanpa konfigurasi manual.</td>
      </tr>
    </tbody>
  </table>

  <!-- BAB 2 -->
  <div class="chapter-heading">BAB 2: ALUR OPERASIONAL ANTRIAN HARIAN</div>

  <h2>1. Siklus Hidup Tiket Antrian</h2>
  <p>
    Setiap nomor antrian memiliki status terstruktur yang dicatat secara *real-time* ke basis data untuk menjaga integritas laporan transaksi cabang:
  </p>
  <div class="diagram-box">
  [ WAITING ] ──────(Petugas Tekan "Panggil")─────> [ SERVING ] ──────(Layanan Selesai)─────> [ DONE ]
       │                                                 │
       │ (Tanggal Berganti Sebelum Dipanggil)            └──(Nasabah Tidak Hadir)──> [ NO_SHOW ]
       ▼
  [ EXPIRED ]</div>

  <table>
    <thead>
      <tr>
        <th style="width: 20%;">Status Tiket</th>
        <th style="width: 25%;">Arti Operasional</th>
        <th>Keterangan pada Laporan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><span class="badge badge-sky">WAITING</span></td>
        <td>Menunggu Dipanggil</td>
        <td>Tiket telah dicetak nasabah dan sedang dalam antrian tunggu.</td>
      </tr>
      <tr>
        <td><span class="badge badge-orange">SERVING</span></td>
        <td>Sedang Dilayani</td>
        <td>Nomor telah dipanggil dan nasabah sedang berada di meja loket petugas.</td>
      </tr>
      <tr>
        <td><span class="badge badge-success">DONE</span></td>
        <td>Selesai Dilayani</td>
        <td>Transaksi perbankan selesai. Waktu tunggu dan waktu layanan dihitung.</td>
      </tr>
      <tr>
        <td><span class="badge badge-danger">NO_SHOW</span></td>
        <td>Tidak Hadir</td>
        <td>Nasabah dipanggil ulang beberapa kali namun tidak menuju ke meja loket.</td>
      </tr>
      <tr>
        <td><span class="badge badge-navy">EXPIRED</span></td>
        <td>Kedaluwarsa</td>
        <td>Tiket diambil namun kantor tutup sebelum tiket sempat dipanggil.</td>
      </tr>
    </tbody>
  </table>

  <h2>2. Rutinitas Buka &amp; Tutup Kantor Harian</h2>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Pagi Hari (Persiapan Operasional)</div>
        Nyalakan PC Mesin Tiket / Server Utama terlebih dahulu, disusul PC Layar TV dan PC Loket Petugas. Semua aplikasi akan langsung berjalan otomatis (*auto-start*) dan saling terhubung tanpa pengaturan ulang. Nomor antrian otomatis kembali dari 001 (contoh: A001, B001).
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Siang Hari (Jam Layanan)</div>
        Petugas loket login ke aplikasi Loket, memilih meja yang digunakan, lalu klik "Buka Loket". Nasabah mengambil tiket di Kiosk dan menunggu panggilan di TV.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Sore Hari (Tutup Operasional)</div>
        Petugas menekan tombol "Tutup Loket" lalu logout. Admin memeriksa rekapan di menu Laporan Harian. Komputer TV, Loket, dan Kiosk dapat dimatikan seperti biasa. Server antrian melakukan backup harian otomatis.
      </div>
    </div>
  </div>

  <!-- BAB 3 -->
  <div class="chapter-heading">BAB 3: PANDUAN MESIN KIOSK TIKET (NASABAH)</div>

  <h2>1. Tata Letak Layar Kiosk</h2>
  <p>
    Tampilan Kiosk Tiket Bank NTT dirancang dengan prinsip ergonomis layar sentuh:
  </p>
  <ul>
    <li><strong>Header</strong>: Menampilkan logo resmi Bank NTT, nama kantor cabang, tanggal hari ini, dan jam digital yang sinkron dengan waktu cabang.</li>
    <li><strong>Kartu Layanan</strong>: Tombol layanan berukuran proporsional dengan jarak renggang (*gap horizontal* 56px), dilengkapi huruf awalan antrian (Prefix <strong>A</strong>, <strong>B</strong>, dst.), nama layanan, dan indikator jumlah antrian yang sedang menunggu.</li>
    <li><strong>Footer</strong>: Aksen garis warna korporat Bank NTT (Navy, Sky Blue, dan Orange).</li>
  </ul>

  <h2>2. Alur Pengambilan Tiket oleh Nasabah</h2>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Menyentuh Tombol Layanan</div>
        Nasabah menyentuh salah satu kartu layanan di layar, misalnya <strong>Customer Service (A)</strong> atau <strong>Teller (B)</strong>. Tombol dilengkapi proteksi sentuhan ganda (*anti-double-touch*) sehingga nasabah tidak akan sengaja mencetak dua tiket sekaligus.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Konfirmasi &amp; Cetak Tiket Fisik</div>
        Layar segera menampilkan jendela pop-up konfirmasi nomor antrian (contoh: <code>A001</code>) dan menginformasikan berapa jumlah orang yang mengantri di depannya. Mesin tiket langsung mencetak struk antrian thermal secara senyap tanpa dialog browser.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Kembali ke Layar Utama</div>
        Setelah 4 detik, layar otomatis kembali bersih ke menu pemilihan layanan dan siap melayani nasabah berikutnya.
      </div>
    </div>
  </div>

  <div class="callout tip">
    <div class="callout-title">💡 Deteksi Status Printer Thermal Otomatis</div>
    Aplikasi Kiosk Windows secara cerdas memantau kondisi hardware printer setiap 10 detik. Jika kertas habis atau printer mati, Kiosk akan menampilkan pemberitahuan <em>"Mohon hubungi petugas (Printer belum siap)"</em> dan mencegah nasabah mengambil nomor agar nasabah tidak kehilangan struk fisiknya. Saat kertas diisi ulang, Kiosk otomatis pulih sendiri.
  </div>

  <!-- BAB 4 -->
  <div class="chapter-heading">BAB 4: PANDUAN LAYAR MONITOR TV RUANG TUNGGU</div>

  <h2>1. Pembagian Layar TV Antrian</h2>
  <p>
    Layar TV ruang tunggu menyajikan informasi antrian secara jernih dan nyaman dibaca dari kejauhan:
  </p>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">📌 Sisi Kiri: Panggilan Utama</div>
      <p style="font-size: 8.5pt; margin: 0;">
        Menampilkan nomor antrian yang <strong>paling baru dipanggil</strong> dengan ukuran huruf sangat besar, nama layanan, dan nomor loket tujuan. Di bawahnya terdapat daftar riwayat panggilan sebelumnya.
      </p>
    </div>
    <div class="card">
      <div class="card-title">📌 Sisi Kanan: Grid Meja Loket</div>
      <p style="font-size: 8.5pt; margin: 0;">
        Menampilkan seluruh loket yang ada di kantor cabang (CS 1-3, Teller 1-4) beserta nomor antrian yang saat ini sedang dilayani di masing-masing loket atau status jika sedang tutup/istirahat.
      </p>
    </div>
  </div>

  <h2>2. Sistem Suara Panggilan Otomatis (Audio Chime &amp; Voice)</h2>
  <ul>
    <li>Saat petugas menekan tombol panggil di loket, kotak loket terkait di layar TV akan berkedip dengan animasi visual.</li>
    <li>Bel lonceng (*chime*) merdu berbunyi dua nada, diikuti suara vokal pemanggilan berbahasa Indonesia yang jernih:
      <div class="callout">
        <em>"Nomor antrian... <strong>B... 0... 0... 7</strong>... menuju ke loket... <strong>Teller 2</strong>"</em>
      </div>
    </li>
    <li>Bila beberapa loket memanggil dalam waktu yang bersamaan, sistem suara mengantrikan audio dan membacakannya secara berurutan (*sequential speech queue*) sehingga suara tidak tumpang tindih.</li>
  </ul>

  <!-- BAB 5 -->
  <div class="chapter-heading">BAB 5: PANDUAN PETUGAS LOKET (CUSTOMER SERVICE &amp; TELLER)</div>

  <h2>1. Memulai Tugas di Meja Loket</h2>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Login ke Aplikasi Loket</div>
        Buka aplikasi <strong>BANK NTT Loket</strong> di PC meja kerja Anda (atau buka browser dan ketik alamat server <code>/counter</code>). Masukkan nama pengguna dan kata sandi Anda.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Memilih &amp; Membuka Loket</div>
        Pilih loket yang menjadi tanggung jawab Anda hari ini (misal: <strong>Teller 1</strong>). Klik tombol <strong>Buka Loket</strong>. Status loket di TV otomatis berubah menjadi Buka dan menampilkan nama Anda.
      </div>
    </div>
  </div>

  <h2>2. Tombol Aksi Pelayanan Loket</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 24%;">Tombol / Aksi</th>
        <th style="width: 22%;">Shortcut Keyboard</th>
        <th>Fungsi dan Keterangan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Panggil Berikutnya</strong></td>
        <td><kbd>Spasi</kbd> / <kbd>Enter</kbd></td>
        <td>Memanggil nomor antrian paling depan yang berhak dilayani di loket ini. TV dan audio langsung memproses panggilan. Timer durasi layanan mulai berjalan.</td>
      </tr>
      <tr>
        <td><strong>Panggil Ulang</strong></td>
        <td><kbd>R</kbd></td>
        <td>Membunyikan ulang panggilan ke layar TV dan speaker bila nasabah belum mendengar panggilan pertama. Dibatasi sesuai batas maksimal recall (default 3x).</td>
      </tr>
      <tr>
        <td><strong>Tidak Hadir</strong></td>
        <td><kbd>N</kbd></td>
        <td>Mengubah status tiket menjadi NO_SHOW bila nasabah tetap tidak datang setelah dipanggil ulang. Tiket dibatalkan dan petugas siap memanggil berikutnya.</td>
      </tr>
      <tr>
        <td><strong>Selesai Layanan</strong></td>
        <td><kbd>D</kbd></td>
        <td>Menandai transaksi nasabah telah selesai. Waktu pelayanan dicatat ke laporan.</td>
      </tr>
      <tr>
        <td><strong>Istirahat</strong></td>
        <td>—</td>
        <td>Mengubah status loket menjadi "Istirahat" (misal saat ishoma). Meja loket tetap tercatat atas nama Anda dan TV menampilkan status istirahat.</td>
      </tr>
      <tr>
        <td><strong>Tutup Loket</strong></td>
        <td>—</td>
        <td>Menutup loket dan melepaskan sesi meja saat jam kerja selesai. Selalu lakukan ini sebelum mematikan komputer.</td>
      </tr>
    </tbody>
  </table>

  <!-- BAB 6 -->
  <div class="chapter-heading">BAB 6: PANDUAN LENGKAP PANEL KONTROL ADMIN CABANG</div>

  <p>
    Panel Admin diakses melalui alamat <code>/admin</code> oleh Supervisor Cabang, Pemimpin Bidang Operasional, atau Petugas IT Cabang menggunakan akun berhak akses <strong>Admin</strong>.
  </p>

  <h2>1. Dasbor Operasional (Realtime Monitor)</h2>
  <p>
    Menampilkan ringkasan langsung aktivitas cabang hari ini:
  </p>
  <ul>
    <li>Total nomor antrian yang diambil nasabah hari ini.</li>
    <li>Jumlah antrian yang sedang menunggu dan jumlah yang sedang dilayani.</li>
    <li>Rata-rata waktu tunggu nasabah (dari ambil tiket sampai dipanggil).</li>
    <li>Rata-rata waktu pelayanan (dari dipanggil sampai transaksi selesai).</li>
    <li>Status langsung seluruh loket cabang (Siapa petugas yang bertugas, status Buka/Tutup/Istirahat, dan nomor yang sedang dilayani).</li>
  </ul>

  <h2>2. Manajemen Loket (Meja Antrian)</h2>
  <ul>
    <li><strong>Menambah Loket Baru</strong>: Masukkan nama loket (contoh: <code>CS 3</code> atau <code>Teller Khusus</code>), tentukan nomor tampil di TV, dan centang layanan apa saja yang boleh dilayani di loket tersebut.</li>
    <li><strong>Standarisasi Switcher Status Aktif / Nonaktif</strong>: Setiap kartu loket dilengkapi tombol toggle switch dengan label <strong>"Aktif"</strong> atau <strong>"Nonaktif"</strong>. Loket yang dinonaktifkan tidak akan muncul di TV maupun pilihan petugas.</li>
    <li><strong>Aksi Hapus Loket &amp; Pop-up Konfirmasi</strong>: Klik tombol <strong>Hapus</strong> (merah) pada kartu loket. Sistem akan menampilkan pop-up konfirmasi modal untuk mencegah penghapusan yang tidak disengaja. Loket yang sedang aktif atau melayani nasabah dilindungi dan tidak dapat dihapus sebelum ditutup.</li>
    <li><strong>Tutup Paksa</strong>: Jika petugas lupa menutup loket dan komputernya sudah mati, admin dapat menekan tombol "Tutup Paksa" agar loket tersebut dapat digunakan oleh petugas lain.</li>
  </ul>

  <h2>3. Manajemen Layanan Antrian</h2>
  <ul>
    <li><strong>Menambah Layanan</strong>: Masukkan nama layanan (misalnya <code>Customer Service</code>, <code>Teller</code>, atau <code>Prioritas</code>), tentukan huruf awalan tiket (Prefix 1–2 karakter, contoh: <code>A</code>, <code>B</code>, <code>P</code>), dan nomor urut tombol di kiosk.</li>
    <li><strong>Atur Loket</strong>: Menentukan loket mana saja yang berhak melayani jenis antrian ini. Satu loket dapat melayani beberapa layanan sekaligus (misal Loket 1 melayani CS dan Prioritas).</li>
    <li><strong>Switcher Aktif / Nonaktif</strong>: Layanan yang dinonaktifkan akan disembunyikan dari mesin Kiosk Tiket sehingga nasabah tidak bisa mengambil nomornya, namun riwayat transaksi lama tetap aman tersimpan.</li>
    <li><strong>Aksi Hapus Layanan &amp; Validasi Keamanan</strong>: Layanan dapat dihapus permanen melalui tombol Hapus dengan konfirmasi modal. Sistem memvalidasi bahwa tidak ada tiket antrian yang sedang menunggu atau dilayani hari ini sebelum penghapusan diizinkan.</li>
  </ul>

  <h2>4. Manajemen Akun Petugas</h2>
  <ul>
    <li><strong>Menambah Akun</strong>: Tentukan nama lengkap, username, kata sandi awal (minimal 6 karakter), dan peran (<code>Petugas</code> atau <code>Admin</code>).</li>
    <li><strong>Kebijakan Ganti Sandi Pertama Kali</strong>: Petugas baru otomatis ditandai dengan badge <em>"Wajib ganti sandi"</em>. Saat pertama kali login, petugas diwajibkan mengganti kata sandi sementara tersebut demi keamanan.</li>
    <li><strong>Switcher Status Akun Langsung</strong>: Pada tabel daftar petugas, kolom Status menggunakan switcher interaktif <strong>Aktif / Nonaktif</strong>. Akun yang dinonaktifkan langsung diblokir dan sesinya dikeluarkan dari semua komputer.</li>
    <li><strong>Aksi Hapus Akun &amp; Pop-up Konfirmasi</strong>: Tombol Hapus pada baris tabel menghapus akun permanen setelah konfirmasi modal. Sistem mencegah admin menghapus akunnya sendiri dan mencegah penghapusan staf yang sedang bertugas di loket yang aktif. Riwayat tiket yang pernah dilayani oleh akun tersebut tetap utuh di basis data.</li>
  </ul>

  <h2>5. Laporan Transaksi &amp; Ekspor Excel</h2>
  <ul>
    <li><strong>Laporan Harian</strong>: Rekapitulasi transaksi per tanggal, rincian per layanan, kinerja per loket, dan performa per petugas. Dilengkapi statistik waktu tunggu dan waktu transaksi.</li>
    <li><strong>Laporan Rentang Waktu (Mingguan / Bulanan)</strong>: Menampilkan tren antrian cabang dalam periode tertentu untuk kebutuhan evaluasi manajemen cabang.</li>
    <li><strong>Ekspor Dokumen</strong>: Klik tombol <strong>Ekspor Excel (.xlsx)</strong> untuk mengunduh laporan berformat spreadsheet resmi yang siap dicetak atau dilaporkan ke Kantor Pusat.</li>
  </ul>

  <!-- BAB 7 -->
  <div class="chapter-heading">BAB 7: PANDUAN PEMASANGAN &amp; PENGUJIAN DI PC WINDOWS</div>

  <h2>1. Empat Paket Installer Produksi</h2>
  <p>
    Seluruh installer aplikasi telah dibundle mandiri di folder <code>downloads/windows/</code> dan siap digunakan tanpa perlu menginstall Node.js, Docker, Git, ataupun database manual di komputer cabang:
  </p>
  <table>
    <thead>
      <tr>
        <th style="width: 32%;">File Installer</th>
        <th style="width: 25%;">Target Komputer</th>
        <th>Isi Paket &amp; Perilaku</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong><code>BANK-NTT-Ticket-Server-Setup.exe</code></strong></td>
        <td><strong>PC Mesin Tiket Utama</strong></td>
        <td>Paket lengkap: Aplikasi Tiket Kiosk + PostgreSQL Lokal + Server Antrian (Windows Service) + Firewall. Cukup dipasang di 1 PC utama ini saja.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-TV-Setup.exe</code></strong></td>
        <td>PC Layar TV Ruang Tunggu</td>
        <td>Aplikasi monitor display antrian layar penuh terkunci, audio chime otomatis, dan auto-pairing.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-Loket-Setup.exe</code></strong></td>
        <td>PC Meja Teller / CS</td>
        <td>Aplikasi kerja petugas loket dengan shortcut pemanggilan keyboard.</td>
      </tr>
      <tr>
        <td><strong><code>BANK-NTT-Admin-Setup.exe</code></strong></td>
        <td>PC Supervisor / Pimpinan</td>
        <td>Aplikasi kontrol manajemen cabang dan unduh laporan Excel.</td>
      </tr>
    </tbody>
  </table>

  <h2>2. Langkah Pemasangan Server di Mesin Tiket Utama</h2>
  <div class="step-list">
    <div class="step-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Salin File Installer ke PC Utama</div>
        Salin file <code>BANK-NTT-Ticket-Server-Setup.exe</code> ke PC di dalam mesin tiket (misalnya via flashdisk).
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Jalankan Instalasi Sebagai Administrator</div>
        Klik kanan file <code>BANK-NTT-Ticket-Server-Setup.exe</code> &rarr; pilih <strong>Run as administrator</strong>. Ikuti petunjuk di layar hingga proses instalasi selesai.
      </div>
    </div>
    <div class="step-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Verifikasi Layanan Otomatis</div>
        Installer akan secara otomatis mengkonfigurasi database PostgreSQL (service <code>BankNTT-PostgreSQL</code>) dan Server Antrian (service <code>BankNTT-Server</code>) sebagai Windows Services yang langsung menyala saat PC dihidupkan (*auto-start*). Layar mesin tiket langsung membuka Kiosk Bank NTT dan siap digunakan.
      </div>
    </div>
  </div>

  <h2>3. Pemasangan Aplikasi di TV, Loket, dan Admin (Auto-Discovery)</h2>
  <ul>
    <li>Di PC TV: Jalankan <code>BANK-NTT-TV-Setup.exe</code>. Buka aplikasi TV, aplikasi akan otomatis memindai jaringan LAN &rarr; menemukan IP Server &rarr; langsung tersambung dan menampilkan layar antrian tanpa perlu input PIN atau kode.</li>
    <li>Di PC Loket: Jalankan <code>BANK-NTT-Loket-Setup.exe</code>. Buka aplikasi Loket, aplikasi otomatis tersambung ke server dan menampilkan layar Login Petugas.</li>
    <li>Di PC Admin: Jalankan <code>BANK-NTT-Admin-Setup.exe</code> (atau cukup buka browser Chrome/Edge dan ketik alamat IP server, contoh: <code>http://192.168.1.50:3000/admin</code>).</li>
  </ul>

  <!-- BAB 8 -->
  <div class="chapter-heading">BAB 8: PERAWATAN, BACKUP, DAN RESET DATA BERSIH</div>

  <h2>1. Prosedur Backup Database Harian</h2>
  <p>
    Sistem secara otomatis membuat salinan cadangan (*backup dump*) setiap malam pukul 22:30 ke folder <code>C:\\ProgramData\\BankNTT\\backups</code>. Cadangan disimpan selama 30 hari. Admin cabang disarankan menyalin folder cadangan ini ke flashdisk atau Google Drive cabang secara berkala.
  </p>

  <h2>2. Reset Data Bersih Sebelum Go-Live Produksi</h2>
  <p>
    Setelah cabang melakukan pengujian uji coba (misal menguji panggil nomor antrian tes), seluruh nomor tiket dan transaksi uji coba harus dibersihkan sebelum cabang resmi dibuka untuk nasabah umum, dengan tetap menyisakan akun admin, akun petugas, daftar layanan, dan loket.
  </p>

  <div class="callout warning">
    <div class="callout-title">⚠️ Cara Reset Data Bersih di PC Server Windows</div>
    <ol style="margin-top: 6px; padding-left: 20px;">
      <li>Buka folder: <code>C:\\Program Files\\BANK NTT Ticket\\resources\\server\\</code></li>
      <li>Klik kanan file <strong><code>Reset-Data-Server.cmd</code></strong> &rarr; pilih <strong>Run as administrator</strong>.</li>
      <li>Jendela terminal akan membuat backup otomatis terlebih dahulu, lalu meminta konfirmasi: ketik <strong><code>RESET</code></strong> lalu tekan Enter.</li>
      <li>Semua nomor antrian, struk tiket, dan transaksi uji coba langsung kembali bersih ke nol (001). Konfigurasi nama loket, layanan, dan akun petugas tetap aman tersimpan.</li>
    </ol>
  </div>

  <!-- BAB 9 -->
  <div class="chapter-heading">BAB 9: TANYA JAWAB (FAQ) &amp; PEMECAHAN MASALAH</div>

  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Gejala / Kendala</th>
        <th>Penyebab &amp; Solusi Cepat</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Kiosk / TV menampilkan "Menyambung ke server…" terus menerus</strong></td>
        <td>
          1. Pastikan PC Server / Mesin Tiket utama dalam kondisi menyala.<br>
          2. Pastikan semua komputer berada dalam satu jaringan LAN / Wi-Fi yang sama.<br>
          3. Di Windows, pastikan Network Profile diatur ke <strong>Private Network</strong> (bukan Public), agar discovery port UDP 41234 tidak diblokir Windows Firewall.
        </td>
      </tr>
      <tr>
        <td><strong>Kiosk menampilkan "Printer belum siap"</strong></td>
        <td>
          Periksa kabel USB printer thermal di mesin tiket. Pastikan sakelar printer menyala dan roll kertas tidak habis. Dalam 10 detik setelah kertas diisi, Kiosk akan otomatis pulih.
        </td>
      </tr>
      <tr>
        <td><strong>Layar TV tidak mengeluarkan suara bel / panggilan</strong></td>
        <td>
          1. Pastikan speaker eksternal TV menyala dan volume tidak di-mute.<br>
          2. Jika TV menggunakan browser biasa, klik layar TV sekali untuk mengizinkan izin audio browser, atau gunakan aplikasi <code>BANK-NTT-TV-Setup.exe</code> yang sudah bebas blokir audio otomatis.
        </td>
      </tr>
      <tr>
        <td><strong>Petugas lupa kata sandi login loket</strong></td>
        <td>
          Supervisor dapat membuka menu <strong>Admin &rarr; Petugas</strong> &rarr; klik tombol <strong>Ubah</strong> pada akun petugas terkait &rarr; masukkan kata sandi sementara baru &rarr; simpan. Petugas dapat langsung login kembali dan mengganti sandinya.
        </td>
      </tr>
      <tr>
        <td><strong>Salah satu loket ditinggalkan petugas dan lupa ditutup</strong></td>
        <td>
          Buka <strong>Admin &rarr; Loket</strong> &rarr; temukan loket yang bersangkutan &rarr; klik tombol <strong>Tutup Paksa</strong> (merah). Loket akan langsung tertutup dan bisa dibuka oleh petugas lain.
        </td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top: 40px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; text-align: center; background: #f8fafc; font-size: 8.5pt; color: #64748b;">
    <strong>Sistem Antrian Kantor Cabang Bank NTT</strong><br>
    Dikembangkan untuk Kebutuhan Operasional Perbankan yang Cepat, Andal, dan Efisien.<br>
    Bila memerlukan bantuan teknis lebih lanjut, hubungi Helpdesk IT Kantor Pusat Bank NTT.
  </div>

</body>
</html>
`;

async function generatePdf() {
  console.log("Memulai pembuatan Buku Panduan PDF Bank NTT...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: {
      top: "16mm",
      bottom: "16mm",
      left: "14mm",
      right: "14mm",
    },
    headerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, sans-serif; color: #94a3b8; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; align-items: center;">
        <span>Buku Panduan Sistem Antrian Bank NTT</span>
        <span>Dokumen Operasional Kantor Cabang</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, sans-serif; color: #94a3b8; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; align-items: center;">
        <span>PT. Bank Pembangunan Daerah Nusa Tenggara Timur</span>
        <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
      </div>
    `,
  });

  await browser.close();

  // Save to target locations
  const targets = [
    path.join(rootDir, "Buku-Panduan-Sistem-Antrian-Bank-NTT.pdf"),
    path.join(rootDir, "docs", "Buku-Panduan-Sistem-Antrian-Bank-NTT.pdf"),
    path.join(rootDir, "downloads", "windows", "Buku-Panduan-Sistem-Antrian-Bank-NTT.pdf"),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, pdfBuffer);
    console.log(`✓ PDF berhasil disimpan di: ${target} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  }

  console.log("Selesai!");
}

generatePdf().catch((err) => {
  console.error("Gagal membuat PDF:", err);
  process.exit(1);
});
