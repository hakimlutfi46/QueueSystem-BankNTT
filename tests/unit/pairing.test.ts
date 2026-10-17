import { describe, expect, it } from "vitest";
import { formatPairCode, generatePairCode, normalizePairCode, PAIR_CODE_ALPHABET } from "@/lib/auth/devices";
import { createPairRateLimit } from "@/lib/auth/pair-rate-limit";
import { kioskApp, readPrinterStatus } from "@/lib/print/kiosk-app";

describe("pairing codes", () => {
  it("uses only easy-to-read characters", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generatePairCode();
      expect(code).toHaveLength(6);
      expect([...code].every((char) => PAIR_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(PAIR_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("accepts what staff type at the kiosk and rejects anything the server never issues", () => {
    expect(normalizePairCode("4k7-q2m")).toBe("4K7Q2M");
    expect(normalizePairCode(" 4K7 Q2M ")).toBe("4K7Q2M");
    expect(normalizePairCode("4K7Q2")).toBeNull();
    expect(normalizePairCode("4K7Q2O")).toBeNull();
    expect(normalizePairCode(123456)).toBeNull();
    expect(formatPairCode("4K7Q2M")).toBe("4K7-Q2M");
  });

  it("blocks an address after too many wrong codes until the window passes", () => {
    const limit = createPairRateLimit(3, 60_000);
    const start = 1_000_000;
    for (let index = 0; index < 3; index += 1) {
      expect(limit.blockedFor("10.0.0.5", start)).toBe(0);
      limit.fail("10.0.0.5", start);
    }
    expect(limit.blockedFor("10.0.0.5", start + 1_000)).toBe(59);
    expect(limit.blockedFor("10.0.0.6", start)).toBe(0);
    expect(limit.blockedFor("10.0.0.5", start + 60_000)).toBe(0);
    limit.fail("10.0.0.6", start);
    limit.reset("10.0.0.6");
    expect(limit.blockedFor("10.0.0.6", start)).toBe(0);
  });
});

describe("Windows kiosk app bridge", () => {
  it("is found only when the app installed it", async () => {
    expect(kioskApp({})).toBeNull();
    expect(kioskApp({ kioskApp: { version: "1.0.0" } })).toBeNull();
    const app = {
      version: "1.0.0",
      printerStatus: async () => ({ ready: true, printer: "POS-80", message: null }),
      printTicket: async () => ({ ok: true, message: null }),
    };
    expect(kioskApp({ kioskApp: app })).toBe(app);
    await expect(readPrinterStatus(app)).resolves.toMatchObject({ ready: true });
  });

  it("treats a failing bridge as a printer that is not ready", async () => {
    const app = {
      version: "1.0.0",
      printerStatus: async () => {
        throw new Error("ipc gone");
      },
      printTicket: async () => ({ ok: true, message: null }),
    };
    await expect(readPrinterStatus(app)).resolves.toMatchObject({ ready: false });
  });
});
