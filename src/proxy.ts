import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { decideDevice, DISPLAY_COOKIE, KIOSK_COOKIE, type DeviceKind } from "@/lib/auth/device";
import { AdminError } from "@/lib/admin/errors";
import { autoRegisterDevice, deviceMatcher, deviceTokenStatus } from "@/lib/auth/devices";
import { autoRegisterRateLimit, clientAddress, longestWait } from "@/lib/auth/rate-limit";
import { getPrisma } from "@/lib/db";

const { auth } = NextAuth(authConfig);

/**
 * 400 hari adalah batas terlama yang disimpan browser. Cookie diperpanjang setiap kali halaman kiosk atau
 * TV dibuka, jadi perangkat yang dipakai tidak pernah kedaluwarsa; hanya Cabut di Admin yang memutusnya.
 */
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

  if (decision.type === "allow") {
    const response = NextResponse.next();
    const kind = pageKind(request.nextUrl.pathname);
    const cookie = kind ? request.cookies.get(cookieName(kind))?.value : undefined;
    if (kind && cookie) response.cookies.set(cookieName(kind), cookie, { ...cookieOptions, secure: isHttps(request) });
    return response;
  }
  if (decision.type === "deny-api") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Perangkat belum diizinkan." } },
      { status: 401 },
    );
  }
  if (decision.type === "deny-page") {
    const kind: DeviceKind = request.nextUrl.pathname.startsWith("/display") ? "display" : "kiosk";
    const db = getPrisma();
    const secure = isHttps(request);
    const status = (state: string) => {
      const url = new URL("/device-required", request.nextUrl);
      url.searchParams.set("kind", kind);
      url.searchParams.set("state", state);
      return NextResponse.redirect(url);
    };

    // A token in the address (desktop apps pass it on every start): explain why it cannot open the page.
    const token = request.nextUrl.searchParams.get("token");
    if (token) {
      const state = await deviceTokenStatus(db, kind, token);
      const response = status(state === "active" ? "unknown" : state);
      if (state === "pending") response.cookies.set(cookieName(kind), token, { ...cookieOptions, secure });
      return response;
    }
    const cookie = request.cookies.get(cookieName(kind))?.value;
    if (cookie) {
      const state = await deviceTokenStatus(db, kind, cookie);
      if (state === "pending" || state === "revoked") return status(state);
      // "unknown" (e.g. database reset): register again below, like a new browser.
    }

    // A browser with no device cookie registers itself and waits for approval in Admin → Perangkat.
    const client = clientAddress(request.headers);
    if (longestWait([[autoRegisterRateLimit.perAddress, client], [autoRegisterRateLimit.overall, "all"]]) > 0) {
      return status("limited");
    }
    autoRegisterRateLimit.perAddress.fail(client);
    autoRegisterRateLimit.overall.fail("all");
    try {
      const paired = await autoRegisterDevice(db, kind);
      const url = request.nextUrl.clone();
      url.searchParams.delete("token");
      const response = paired.approved ? NextResponse.redirect(url) : status("pending");
      response.cookies.set(cookieName(kind), paired.token, { ...cookieOptions, secure });
      return response;
    } catch (error) {
      if (error instanceof AdminError && error.code === "TOO_MANY_PENDING") return status("limited");
      throw error;
    }
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

/** Halaman kiosk atau TV (bukan API) yang cookie perangkatnya diperpanjang setiap dibuka. */
function pageKind(pathname: string): DeviceKind | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname === "/kiosk" || pathname.startsWith("/kiosk/")) return "kiosk";
  if (pathname === "/display" || pathname.startsWith("/display/")) return "display";
  return null;
}

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
