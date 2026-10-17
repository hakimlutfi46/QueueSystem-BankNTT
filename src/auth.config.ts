import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  trustHost: true,
  logger: {
    // Sandi salah adalah kejadian biasa: halaman masuk sudah menampilkan pesannya dan percobaannya dibatasi.
    // Auth.js mencatatnya sebagai galat lengkap dengan stack trace, jadi hanya galat lain yang dicetak.
    error(error: Error) {
      const type = (error as Error & { type?: string }).type;
      if (type === "CredentialsSignin" || error.name === "CredentialsSignin") return;
      console.error(`[auth][error] ${error.name}: ${error.message}`, error);
    },
  },
} satisfies NextAuthConfig;
