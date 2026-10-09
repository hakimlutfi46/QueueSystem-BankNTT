import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_BRANDING, readLogo } from "@/lib/branding";
import type { PrintableTicketView } from "@/lib/print/load-ticket";

/**
 * Tiket sebagai PDF seukuran kertas thermal (80 atau 58 mm), isinya sama dengan halaman cetak:
 * logo, NOMOR ANTRIAN, nomor besar, layanan, waktu, jumlah di depan, dan teks kaki.
 */

const MM = 72 / 25.4;
const MARGIN_MM = 4;
const BLACK = rgb(0, 0, 0);

type Line =
  | { kind: "text"; text: string; size: number; bold: boolean; gapBefore: number }
  | { kind: "logo"; image: PDFImage; height: number; gapBefore: number };

export async function renderTicketPdf(
  ticket: PrintableTicketView,
  options: { logo: { mime: string; bytes: Uint8Array } | null; reprint?: boolean },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tiket ${ticket.number}`);
  pdf.setCreator("Sistem Antrian");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = ticket.widthMm * MM;
  const contentWidth = width - MARGIN_MM * 2 * MM;
  const numberSize = ticket.widthMm >= 80 ? 64 : 48;

  const lines: Line[] = [];
  const image = options.logo ? await embedLogo(pdf, options.logo) : null;
  if (image) lines.push({ kind: "logo", image, height: 16 * MM, gapBefore: 0 });
  const text = (value: string, size: number, isBold: boolean, gapBefore: number) => {
    for (const [index, part] of wrap(clean(value), isBold ? bold : regular, size, contentWidth).entries()) {
      lines.push({ kind: "text", text: part, size, bold: isBold, gapBefore: index === 0 ? gapBefore : 2 });
    }
  };
  // Tanpa logo (misalnya logo unggahan SVG), nama cabang menggantikannya supaya tiket tetap berkop.
  if (!image) text(ticket.branchName, 11, true, 0);
  text("NOMOR ANTRIAN", 9, true, 12);
  text(ticket.number, numberSize, true, 6);
  text(ticket.serviceName, 13, true, 8);
  text(ticket.issuedAt, 9, false, 6);
  text(`${ticket.aheadCount} antrian di depan Anda`, 10, true, 8);
  if (ticket.footer) text(ticket.footer, 8, false, 12);
  if (options.reprint) text("CETAK ULANG", 8, true, 8);

  const contentHeight = lines.reduce(
    (total, line) => total + line.gapBefore + (line.kind === "logo" ? line.height : line.size),
    0,
  );
  const height = contentHeight + MARGIN_MM * 2 * MM + 6;
  const page = pdf.addPage([width, height]);

  let y = height - MARGIN_MM * MM;
  for (const line of lines) {
    y -= line.gapBefore;
    if (line.kind === "logo") {
      const scale = line.height / line.image.height;
      const drawWidth = Math.min(line.image.width * scale, contentWidth);
      const drawHeight = (drawWidth / line.image.width) * line.image.height;
      page.drawImage(line.image, { x: (width - drawWidth) / 2, y: y - drawHeight, width: drawWidth, height: drawHeight });
      y -= line.height;
      continue;
    }
    const font = line.bold ? bold : regular;
    const textWidth = font.widthOfTextAtSize(line.text, line.size);
    // Huruf besar Helvetica tingginya sekitar 0,72 ukuran font; geser garis dasar supaya jarak antarbaris rapi.
    y -= line.size;
    page.drawText(line.text, { x: (width - textWidth) / 2, y: y + line.size * 0.22, size: line.size, font, color: BLACK });
  }

  return pdf.save();
}

/** Logo untuk PDF: logo unggahan bila PNG atau JPG, selain itu logo bawaan. */
export async function loadTicketPdfOptions(
  db: PrismaClient,
  reprint = false,
): Promise<{ logo: { mime: string; bytes: Uint8Array } | null; reprint: boolean }> {
  const custom = await readLogo(db).catch(() => null);
  if (custom && (custom.mime === "image/png" || custom.mime === "image/jpeg")) {
    return { logo: { mime: custom.mime, bytes: custom.bytes }, reprint };
  }
  if (custom) return { logo: null, reprint };
  const file = path.join(process.cwd(), "public", DEFAULT_BRANDING.defaultLogo);
  const bytes = await readFile(file).catch(() => null);
  return { logo: bytes ? { mime: "image/png", bytes } : null, reprint };
}

export function ticketPdfResponse(bytes: Uint8Array, number: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tiket-${number.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function embedLogo(pdf: PDFDocument, logo: { mime: string; bytes: Uint8Array }): Promise<PDFImage | null> {
  try {
    return logo.mime === "image/jpeg" ? await pdf.embedJpg(logo.bytes) : await pdf.embedPng(logo.bytes);
  } catch {
    return null;
  }
}

/** Font standar PDF hanya mengenal Latin-1; huruf lain diganti supaya PDF tetap jadi. */
function clean(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^ -~ -ÿ]/g, "?");
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
