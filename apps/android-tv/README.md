# BANK NTT TV (Android TV)

Aplikasi layar antrian untuk Android TV / Google TV, misalnya Xiaomi TV. Isinya browser layar penuh yang selalu
membuka `/display` di server cabang.

- Server dicari otomatis di jaringan (UDP 41234, sama seperti aplikasi Windows). Bisa juga diisi manual.
- Langsung tersambung tanpa kode selama "Terima perangkat baru otomatis" di Admin → Perangkat menyala (bawaan).
  Kalau dimatikan, TV menunggu tombol Setujui di Admin, atau dipasangkan dengan **kode** dari Admin → Perangkat →
  Layar TV → Kode aplikasi (6 karakter, 30 menit, sekali pakai, langsung disetujui) lewat menu "Pasang ulang dengan kode".
- Suara panggilan langsung aktif, tanpa menekan Aktifkan suara.
- Layar tidak padam, dan aplikasi terbuka sendiri saat TV dinyalakan. Di Android 10+, aplikasi butuh izin
  "tampil di atas aplikasi lain", yang ditanyakan sekali setelah pemasangan dan juga ada di menu.
- Tombol Kembali/Menu pada remote membuka menu: muat ulang, pasang ulang dengan kode, cari server, alamat
  manual, izin buka otomatis, tutup.
- Butuh Android System WebView versi 111 atau lebih baru. Kalau versinya lebih lama, aplikasi menampilkan
  tombol Perbarui WebView (lewat Play Store).

## Build

```bash
npm run tv:build:android   # -> downloads/android/BANK-NTT-TV.apk
```

Butuh JDK dan Android SDK (build-tools + platform), tanpa Gradle. Kunci tanda tangan dibuat sekali di
`apps/android-tv/.signing/bankntt-tv.jks` (tidak masuk git). **Simpan cadangannya**: pembaruan aplikasi
harus ditandatangani dengan kunci yang sama. Kalau kuncinya hilang, aplikasi lama di TV harus di-uninstall dulu.

## Memasang di TV

1. Salin `BANK-NTT-TV.apk` ke flashdisk, colok ke TV, lalu buka lewat pengelola file TV. Izinkan
   "Instal aplikasi tak dikenal" untuk pengelola file tersebut.
2. Buka **BANK NTT TV**. Server ditemukan otomatis dan layar antrian langsung terbuka; TV muncul di
   Admin → Perangkat sebagai "Layar TV".
3. Pilih **Izinkan** saat ditanya soal buka otomatis.
