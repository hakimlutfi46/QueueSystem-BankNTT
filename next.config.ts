import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build untuk uji e2e memakai folder sendiri (NEXT_DIST_DIR=.next-e2e) supaya tidak menimpa cache
  // `npm run dev` di .next; build yang menimpa cache dev membuat halaman dev dimuat ulang terus-menerus.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Hanya berlaku untuk `npm run dev`: izinkan membuka server dev dari perangkat lain di jaringan lokal,
  // misalnya http://192.168.1.10:3000 dari HP, kiosk, atau TV. Server produksi tidak memakai daftar ini.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  output: "standalone",
  experimental: {
    // Saluran debug React di `npm run dev` melempar "stream is closing or closed" dan
    // "enqueueModel is not a function" di browser (terutama Safari) saat halaman dialihkan, misalnya
    // /admin ke /login. Fitur ini hanya untuk DevTools dan tidak ada di build produksi.
    reactDebugChannel: false,
  },
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
