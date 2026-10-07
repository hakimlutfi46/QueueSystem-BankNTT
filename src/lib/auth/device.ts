import { timingSafeEqual } from "node:crypto";

export const KIOSK_COOKIE = "kiosk_token";
export const DISPLAY_COOKIE = "display_token";

export type DeviceKind = "kiosk" | "display";

export type DeviceDecision =
  | { type: "skip" }
  | { type: "allow" }
  | { type: "deny-api" }
  | { type: "deny-page" }
  | { type: "set-cookie"; kind: DeviceKind };

export function deviceToken(kind: DeviceKind): string | undefined {
  const value = kind === "kiosk" ? process.env.KIOSK_TOKEN : process.env.DISPLAY_TOKEN;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function tokenMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function decideDevice(input: {
  pathname: string;
  token: string | null;
  kioskCookie: string | undefined;
  displayCookie: string | undefined;
  hasSession: boolean;
}): DeviceDecision {
  const kind = deviceKind(input.pathname);
  if (!kind) return { type: "skip" };
  if (kind === "shared") {
    if (input.hasSession || cookieMatches("kiosk", input.kioskCookie) || cookieMatches("display", input.displayCookie)) {
      return { type: "allow" };
    }
    return { type: "deny-api" };
  }
  if (tokenMatches(input.token, deviceToken(kind))) {
    return input.pathname.startsWith("/api/") ? { type: "allow" } : { type: "set-cookie", kind };
  }
  if (cookieMatches(kind, kind === "kiosk" ? input.kioskCookie : input.displayCookie)) {
    return { type: "allow" };
  }
  return input.pathname.startsWith("/api/") ? { type: "deny-api" } : { type: "deny-page" };
}

function deviceKind(pathname: string): DeviceKind | "shared" | null {
  if (pathname === "/kiosk" || pathname.startsWith("/kiosk/")) return "kiosk";
  if (pathname === "/display" || pathname.startsWith("/display/")) return "display";
  if (pathname === "/api/tickets" || pathname.startsWith("/api/tickets/")) return "kiosk";
  if (pathname === "/api/queue/state" || pathname === "/api/stream") return "shared";
  return null;
}

function cookieMatches(kind: DeviceKind, cookie: string | undefined): boolean {
  return tokenMatches(cookie, deviceToken(kind));
}
