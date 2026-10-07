import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  if (request.auth) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Silakan masuk." } },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.nextUrl);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/counter/:path*", "/api/counters/:path*", "/admin", "/admin/:path*", "/api/admin/:path*", "/api/reports/:path*"],
};
