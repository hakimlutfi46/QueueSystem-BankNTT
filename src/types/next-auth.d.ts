import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "STAFF";
  }

  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "STAFF";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "STAFF";
  }
}
