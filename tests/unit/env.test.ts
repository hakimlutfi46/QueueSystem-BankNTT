import { afterEach, describe, expect, it } from "vitest";
import { appTimezone } from "@/lib/env";

describe("appTimezone", () => {
  const original = process.env.APP_TIMEZONE;

  afterEach(() => {
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
});
