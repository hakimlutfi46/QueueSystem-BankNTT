import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { ticketOutput } from "@/lib/print/output";
import { renderTicketPdf } from "@/lib/print/ticket-pdf";

const ticket = {
  id: "12",
  number: "A012",
  serviceName: "Customer Service",
  aheadCount: 3,
  issuedAt: "9 Oktober 2026 pukul 09.15",
  branchName: "Kantor Cabang Kupang",
  footer: "Simpan tiket sampai nomor Anda dipanggil. Terima kasih atas kesabaran Anda menunggu giliran.",
  widthMm: 80,
};

describe("ticket output", () => {
  it("uses PDF while developing and the printer in production unless TICKET_OUTPUT says otherwise", () => {
    expect(ticketOutput({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("pdf");
    expect(ticketOutput({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("printer");
    expect(ticketOutput({ NODE_ENV: "production", TICKET_OUTPUT: "pdf" } as NodeJS.ProcessEnv)).toBe("pdf");
    expect(ticketOutput({ NODE_ENV: "development", TICKET_OUTPUT: "printer" } as NodeJS.ProcessEnv)).toBe("printer");
    expect(ticketOutput({ NODE_ENV: "development", TICKET_OUTPUT: "prod" } as NodeJS.ProcessEnv)).toBe("printer");
    expect(ticketOutput({ NODE_ENV: "production", TICKET_OUTPUT: "dev" } as NodeJS.ProcessEnv)).toBe("pdf");
  });
});

describe("renderTicketPdf", () => {
  it("makes one page as wide as the thermal paper", async () => {
    for (const widthMm of [80, 58]) {
      const bytes = await renderTicketPdf({ ...ticket, widthMm }, { logo: null });
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      const page = pdf.getPage(0);
      expect(page.getWidth()).toBeCloseTo((widthMm * 72) / 25.4, 1);
      expect(page.getHeight()).toBeGreaterThan(150);
      expect(pdf.getTitle()).toBe("Tiket A012");
    }
  });

  it("still renders text outside the PDF standard font", async () => {
    const bytes = await renderTicketPdf(
      { ...ticket, branchName: "Cabang “Kupang” — Lantai 1 🙂" },
      { logo: null, reprint: true },
    );
    await expect(PDFDocument.load(bytes)).resolves.toBeTruthy();
  });
});
