import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hanya berlaku untuk `npm run dev`: izinkan membuka server dev dari perangkat lain di jaringan lokal,
  // misalnya http://192.168.1.10:3000 dari HP, kiosk, atau TV. Server produksi tidak memakai daftar ini.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  output: "standalone",
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
