import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { decideDevice, DISPLAY_COOKIE, KIOSK_COOKIE, type DeviceKind } from "@/lib/auth/device";
import { autoRegisterDevice, deviceMatcher } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";

const { auth } = NextAuth(authConfig);

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
};

/**
 * Cookie bertanda Secure hanya disimpan browser lewat HTTPS. Server cabang sering dibuka lewat
 * http://192.168.x.x, jadi tanda itu dipasang mengikuti protokol permintaan, bukan NODE_ENV.
 */
function isHttps(request: { nextUrl: URL; headers: Headers }): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (forwarded ?? request.nextUrl.protocol.replace(":", "")) === "https";
}

export const proxy = auth(async (request) => {
  const decision = await decideDevice({
    pathname: request.nextUrl.pathname,
    token: request.nextUrl.searchParams.get("token"),
    kioskCookie: request.cookies.get(KIOSK_COOKIE)?.value,
    displayCookie: request.cookies.get(DISPLAY_COOKIE)?.value,
    hasSession: Boolean(request.auth),
  }, deviceMatcher(getPrisma()));

  if (decision.type === "allow") return NextResponse.next();
  if (decision.type === "deny-api") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Perangkat belum diizinkan." } },
      { status: 401 },
    );
  }
  if (decision.type === "deny-page") {
    const kind: DeviceKind = request.nextUrl.pathname.startsWith("/display") ? "display" : "kiosk";
    const paired = await autoRegisterDevice(getPrisma(), kind);
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set(cookieName(kind), paired.token, { ...cookieOptions, secure: isHttps(request) });
    return response;
  }
  if (decision.type === "set-cookie") {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set(cookieName(decision.kind), decision.token, { ...cookieOptions, secure: isHttps(request) });
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
    "/account/:path*",
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
