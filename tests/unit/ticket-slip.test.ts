import { describe, expect, it } from "vitest";
import { ticketNumberSizeMm } from "@/components/print/ticket-slip";

describe("ticket number size", () => {
  it("fills the printable width of an 80 mm POS roll without overflowing", () => {
    const size = ticketNumberSizeMm("A001", 72);
    expect(size).toBeGreaterThan(25); // sekitar 77 pt, jauh lebih besar dari 72 pt sebelumnya yang terlihat kecil
    expect(size * 0.62 * 4).toBeLessThanOrEqual(68);
  });

  it("shrinks for longer numbers and narrow 58 mm paper so nothing is cut off", () => {
    expect(ticketNumberSizeMm("A1000", 72) * 0.62 * 5).toBeLessThanOrEqual(68);
    expect(ticketNumberSizeMm("B001", 48) * 0.62 * 4).toBeLessThanOrEqual(44);
    expect(ticketNumberSizeMm("B001", 48)).toBeLessThan(ticketNumberSizeMm("B001", 72));
  });
});
