import { describe, expect, it } from "vitest";
import { brandColorCss, checkContrast, contrastRatio } from "@/lib/branding-colors";

const white = "#ffffff";
const bankNtt = { navy: "#004ea2", blue: "#0075c2", sky: "#0097e0", orange: "#f08300", deep: "#00088f" };

describe("brand colors", () => {
  it("matches the contrast table in PLAN.md", () => {
    expect(contrastRatio(white, bankNtt.navy)).toBeCloseTo(8.0, 0);
    expect(contrastRatio(white, bankNtt.deep)).toBeCloseTo(14.7, 0);
    expect(contrastRatio(bankNtt.orange, bankNtt.deep)).toBeCloseTo(5.6, 0);
    expect(contrastRatio(white, bankNtt.orange)).toBeCloseTo(2.6, 0);
  });

  it("passes every check with the Bank NTT colors and flags a pale primary", () => {
    expect(checkContrast(bankNtt, white).every((check) => check.ok)).toBe(true);
    const pale = checkContrast({ ...bankNtt, navy: "#9fd3ff" }, white);
    expect(pale.find((check) => check.pair.includes("warna utama"))?.ok).toBe(false);
  });

  it("writes only valid hex colors into the override CSS", () => {
    expect(brandColorCss({})).toBe("");
    expect(brandColorCss({ navy: "#AA0000", orange: "red;}body{display:none" })).toBe("html:root{--brand-navy:#aa0000;}");
  });
});

describe("normalizeHex", () => {
  it("reads minified, uppercase, and rgb() colors from CSS", async () => {
    const { normalizeHex } = await import("@/lib/branding-colors");
    expect(normalizeHex(" #FFF ")).toBe("#ffffff");
    expect(normalizeHex("#004EA2")).toBe("#004ea2");
    expect(normalizeHex("rgb(0, 78, 162)")).toBe("#004ea2");
    expect(normalizeHex("var(--x)")).toBe("");
  });
});
