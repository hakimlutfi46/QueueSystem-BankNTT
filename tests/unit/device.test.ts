import { afterEach, describe, expect, it } from "vitest";
import { decideDevice, envDeviceMatcher, tokenMatches, type DeviceMatcher } from "@/lib/auth/device";

const originalKiosk = process.env.KIOSK_TOKEN;
const originalDisplay = process.env.DISPLAY_TOKEN;

afterEach(() => {
  process.env.KIOSK_TOKEN = originalKiosk;
  process.env.DISPLAY_TOKEN = originalDisplay;
});

const request = {
  token: null,
  kioskCookie: undefined,
  displayCookie: undefined,
  hasSession: false,
};

describe("device tokens", () => {
  it("compares tokens in constant time and rejects empty ones", () => {
    expect(tokenMatches("kiosk-secret", "kiosk-secret")).toBe(true);
    expect(tokenMatches("kiosk-secret", "display-secret")).toBe(false);
    expect(tokenMatches("short", "kiosk-secret")).toBe(false);
    expect(tokenMatches("", "kiosk-secret")).toBe(false);
  });

  it("accepts only the matching .env fallback token for each screen", async () => {
    process.env.KIOSK_TOKEN = "kiosk-secret";
    process.env.DISPLAY_TOKEN = "display-secret";
    const decide = (input: Partial<Parameters<typeof decideDevice>[0]>) =>
      decideDevice({ ...request, pathname: "/kiosk", ...input }, envDeviceMatcher);

    await expect(decide({ token: "kiosk-secret" })).resolves.toEqual({
      type: "set-cookie",
      kind: "kiosk",
      token: "kiosk-secret",
    });
    await expect(decide({ pathname: "/display", token: "kiosk-secret" })).resolves.toEqual({ type: "deny-page" });
    await expect(decide({ pathname: "/api/tickets", kioskCookie: "kiosk-secret" })).resolves.toEqual({ type: "allow" });
    await expect(decide({ pathname: "/api/queue/state", displayCookie: "display-secret" })).resolves.toEqual({
      type: "allow",
    });
    await expect(decide({ pathname: "/api/queue/state", hasSession: true })).resolves.toEqual({ type: "allow" });
    await expect(
      decide({ pathname: "/api/tickets", displayCookie: "display-secret", hasSession: true }),
    ).resolves.toEqual({ type: "deny-api" });
  });

  it("works without .env tokens when the device is registered in Admin", async () => {
    process.env.KIOSK_TOKEN = "";
    process.env.DISPLAY_TOKEN = "";
    const registered: DeviceMatcher = async (kind, token) => kind === "display" && token === "tv-lobi";

    await expect(
      decideDevice({ ...request, pathname: "/display", token: "tv-lobi" }, registered),
    ).resolves.toEqual({ type: "set-cookie", kind: "display", token: "tv-lobi" });
    await expect(
      decideDevice({ ...request, pathname: "/display", displayCookie: "tv-lobi" }, registered),
    ).resolves.toEqual({ type: "allow" });
    await expect(
      decideDevice({ ...request, pathname: "/kiosk", token: "tv-lobi" }, registered),
    ).resolves.toEqual({ type: "deny-page" });
    await expect(decideDevice({ ...request, pathname: "/display" }, envDeviceMatcher)).resolves.toEqual({
      type: "deny-page",
    });
  });
});
