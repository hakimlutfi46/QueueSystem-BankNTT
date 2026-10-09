import { timingSafeEqual } from "node:crypto";

export const KIOSK_COOKIE = "kiosk_token";
export const DISPLAY_COOKIE = "display_token";

export type DeviceKind = "kiosk" | "display";

export type DeviceDecision =
  | { type: "skip" }
  | { type: "allow" }
  | { type: "deny-api" }
  | { type: "deny-page" }
  | { type: "set-cookie"; kind: DeviceKind; token: string };

/** Benar bila token berlaku untuk jenis perangkat itu: perangkat terdaftar di Admin, atau token cadangan di .env. */
export type DeviceMatcher = (kind: DeviceKind, token: string) => Promise<boolean>;

/** Token cadangan dari .env (KIOSK_TOKEN, DISPLAY_TOKEN). Opsional; perangkat biasanya didaftarkan dari Admin. */
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

export async function decideDevice(
  input: {
    pathname: string;
    token: string | null;
    kioskCookie: string | undefined;
    displayCookie: string | undefined;
    hasSession: boolean;
  },
  matches: DeviceMatcher,
): Promise<DeviceDecision> {
  const kind = deviceKind(input.pathname);
  if (!kind) return { type: "skip" };
  if (kind === "shared") {
    if (input.hasSession) return { type: "allow" };
    if (input.kioskCookie && (await matches("kiosk", input.kioskCookie))) return { type: "allow" };
    if (input.displayCookie && (await matches("display", input.displayCookie))) return { type: "allow" };
    return { type: "deny-api" };
  }
  if (input.token && (await matches(kind, input.token))) {
    return input.pathname.startsWith("/api/")
      ? { type: "allow" }
      : { type: "set-cookie", kind, token: input.token };
  }
  const cookie = kind === "kiosk" ? input.kioskCookie : input.displayCookie;
  if (cookie && (await matches(kind, cookie))) return { type: "allow" };
  return input.pathname.startsWith("/api/") ? { type: "deny-api" } : { type: "deny-page" };
}

/** Pencocok untuk token cadangan .env saja. */
export const envDeviceMatcher: DeviceMatcher = async (kind, token) => tokenMatches(token, deviceToken(kind));

function deviceKind(pathname: string): DeviceKind | "shared" | null {
  if (pathname === "/kiosk" || pathname.startsWith("/kiosk/")) return "kiosk";
  if (pathname === "/display" || pathname.startsWith("/display/")) return "display";
  if (pathname === "/api/tickets" || pathname.startsWith("/api/tickets/")) return "kiosk";
  if (pathname === "/api/queue/state" || pathname === "/api/stream") return "shared";
  return null;
}
