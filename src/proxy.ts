import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  decideDevice,
  deviceToken,
  DISPLAY_COOKIE,
  KIOSK_COOKIE,
  type DeviceKind,
} from "@/lib/auth/device";

const { auth } = NextAuth(authConfig);

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 400,
};

export const proxy = auth((request) => {
  const decision = decideDevice({
    pathname: request.nextUrl.pathname,
    token: request.nextUrl.searchParams.get("token"),
    kioskCookie: request.cookies.get(KIOSK_COOKIE)?.value,
    displayCookie: request.cookies.get(DISPLAY_COOKIE)?.value,
    hasSession: Boolean(request.auth),
  });

  if (decision.type === "allow") return NextResponse.next();
  if (decision.type === "deny-api") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Perangkat belum diizinkan." } },
      { status: 401 },
    );
  }
  if (decision.type === "deny-page") {
    return NextResponse.redirect(new URL("/device-required", request.url));
  }
  if (decision.type === "set-cookie") {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set(cookieName(decision.kind), deviceToken(decision.kind) ?? "", cookieOptions);
    return response;
  }

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

function cookieName(kind: DeviceKind): string {
  return kind === "kiosk" ? KIOSK_COOKIE : DISPLAY_COOKIE;
}

export const config = {
  matcher: [
    "/counter/:path*",
    "/api/counters/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/reports/:path*",
    "/kiosk",
    "/kiosk/:path*",
    "/display",
    "/display/:path*",
    "/api/tickets",
    "/api/tickets/:path*",
    "/api/queue/:path*",
  ],
};
