import { afterEach, describe, expect, it } from "vitest";
import { decideDevice, tokenMatches } from "@/lib/auth/device";

const originalKiosk = process.env.KIOSK_TOKEN;
const originalDisplay = process.env.DISPLAY_TOKEN;

afterEach(() => {
  process.env.KIOSK_TOKEN = originalKiosk;
  process.env.DISPLAY_TOKEN = originalDisplay;
});

describe("device tokens", () => {
  it("accepts only the matching token", () => {
    process.env.KIOSK_TOKEN = "kiosk-secret";
    process.env.DISPLAY_TOKEN = "display-secret";
    expect(tokenMatches("kiosk-secret", "kiosk-secret")).toBe(true);
    expect(tokenMatches("kiosk-secret", "display-secret")).toBe(false);
    expect(tokenMatches("short", "kiosk-secret")).toBe(false);
    expect(tokenMatches("", "kiosk-secret")).toBe(false);

    expect(decideDevice({
      pathname: "/kiosk",
      token: "kiosk-secret",
      kioskCookie: undefined,
      displayCookie: undefined,
      hasSession: false,
    })).toEqual({ type: "set-cookie", kind: "kiosk" });
    expect(decideDevice({
      pathname: "/display",
      token: "kiosk-secret",
      kioskCookie: undefined,
      displayCookie: undefined,
      hasSession: false,
    })).toEqual({ type: "deny-page" });
    expect(decideDevice({
      pathname: "/api/tickets",
      token: null,
      kioskCookie: "kiosk-secret",
      displayCookie: undefined,
      hasSession: false,
    })).toEqual({ type: "allow" });
    expect(decideDevice({
      pathname: "/api/queue/state",
      token: null,
      kioskCookie: undefined,
      displayCookie: "display-secret",
      hasSession: false,
    })).toEqual({ type: "allow" });
    expect(decideDevice({
      pathname: "/api/queue/state",
      token: null,
      kioskCookie: undefined,
      displayCookie: undefined,
      hasSession: true,
    })).toEqual({ type: "allow" });
    expect(decideDevice({
      pathname: "/api/tickets",
      token: null,
      kioskCookie: undefined,
      displayCookie: "display-secret",
      hasSession: true,
    })).toEqual({ type: "deny-api" });
  });
});
