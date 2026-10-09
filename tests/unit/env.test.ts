import { afterEach, describe, expect, it } from "vitest";
import { appTimezone, setTimezoneOverride } from "@/lib/env";

describe("appTimezone", () => {
  const original = process.env.APP_TIMEZONE;

  afterEach(() => {
    setTimezoneOverride(null);
    if (original === undefined) {
      delete process.env.APP_TIMEZONE;
    } else {
      process.env.APP_TIMEZONE = original;
    }
  });

  it("defaults to Asia/Makassar", () => {
    delete process.env.APP_TIMEZONE;
    expect(appTimezone()).toBe("Asia/Makassar");
  });

  it("reads APP_TIMEZONE when it is set", () => {
    process.env.APP_TIMEZONE = "Asia/Jakarta";
    expect(appTimezone()).toBe("Asia/Jakarta");
  });

  it("prefers the zone chosen in Admin and ignores anything outside Indonesia", () => {
    process.env.APP_TIMEZONE = "Asia/Makassar";
    setTimezoneOverride("Asia/Jakarta");
    expect(appTimezone()).toBe("Asia/Jakarta");
    setTimezoneOverride("Europe/London");
    expect(appTimezone()).toBe("Asia/Makassar");
  });
});
