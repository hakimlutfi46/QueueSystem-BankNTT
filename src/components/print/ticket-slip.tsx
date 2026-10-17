import { BrandLogo } from "@/components/brand/brand-logo";
import type { PrintableTicketView } from "@/lib/print/load-ticket";

/** Lebar cetak printer POS: kertas 80 mm mencetak sekitar 72 mm, kertas 58 mm sekitar 48 mm. */
const PRINTABLE_MM: Record<number, number> = { 80: 72, 58: 48 };
const SIDE_PADDING_MM = 2;
const BOTTOM_FEED_MM = 6;

/**
 * Ukuran huruf nomor antrian dalam mm, supaya nomor memenuhi lebar kertas tanpa terpotong.
 * Huruf tebal rata-rata selebar 0,62 tinggi hurufnya.
 */
export function ticketNumberSizeMm(number: string, printableMm: number): number {
  const inner = printableMm - SIDE_PADDING_MM * 2;
  return Math.min(30, inner / (Math.max(number.length, 3) * 0.62));
}

/**
 * Isi tiket thermal, hitam-putih: logo, nomor, layanan, jumlah di depan, waktu, dan teks kaki.
 * Dipakai kiosk dan cetak ulang. Ukuran dalam mm dan pt supaya hasil cetak sama di semua printer POS.
 */
export function TicketSlip({ ticket, reprint = false }: { ticket: PrintableTicketView; reprint?: boolean }) {
  const printable = PRINTABLE_MM[ticket.widthMm] ?? Math.max(ticket.widthMm - 8, 40);
  // Semua ukuran disetel untuk kertas 80 mm, lalu dikecilkan seimbang untuk kertas 58 mm.
  const scale = printable / 72;
  const pt = (size: number) => `${(size * scale).toFixed(1)}pt`;
  const mm = (size: number) => `${(size * scale).toFixed(1)}mm`;

  return (
    <>
      <style>{`
        /* Ukuran kertas harus sah (lebar dan tinggi). Tanpa itu Chrome memakai A4 dari aturan cetak global,
           lalu driver printer POS mengecilkan seluruh halaman A4 ke kertas 80 mm. Tingginya disetel ulang
           oleh skrip di bawah sesuai panjang isi tiket. */
        @page { size: ${ticket.widthMm}mm 160mm; margin: 0; }
        html, body { background: white; color: black; margin: 0; padding: 0; }
      `}</style>
      <main
        id="ticket"
        className="mx-auto bg-white text-center text-black"
        style={{
          width: `${printable}mm`,
          padding: `${mm(3)} ${SIDE_PADDING_MM}mm ${BOTTOM_FEED_MM}mm`,
          boxSizing: "border-box",
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        <div style={{ height: mm(17) }}>
          <BrandLogo variant="color" className="mx-auto h-full grayscale" />
        </div>
        <p style={{ marginTop: mm(4), fontSize: pt(15), letterSpacing: "0.08em" }}>NOMOR ANTRIAN</p>
        <p
          className="tabular-nums"
          style={{ marginTop: mm(1), fontSize: `${ticketNumberSizeMm(ticket.number, printable)}mm`, lineHeight: 1 }}
        >
          {ticket.number}
        </p>
        <p style={{ marginTop: mm(2), fontSize: pt(20), overflowWrap: "break-word" }}>{ticket.serviceName}</p>
        <div style={{ margin: `${mm(4)} 0`, borderTop: "0.6mm dashed black" }} aria-hidden="true" />
        <p style={{ fontSize: pt(17) }}>{ticket.aheadCount} antrian di depan Anda</p>
        <p style={{ marginTop: mm(2), fontSize: pt(13), fontWeight: 400 }}>{ticket.issuedAt}</p>
        {ticket.footer ? (
          <p style={{ marginTop: mm(4), fontSize: pt(12), fontWeight: 400, overflowWrap: "break-word" }}>{ticket.footer}</p>
        ) : null}
        {reprint ? <p style={{ marginTop: mm(3), fontSize: pt(12) }}>CETAK ULANG</p> : null}
      </main>
      {/* Tinggi kertas mengikuti isi tiket, jadi printer tidak mengeluarkan kertas kosong panjang. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var t=document.getElementById("ticket");if(!t)return;var h=Math.ceil(t.getBoundingClientRect().height*25.4/96)+2;var s=document.createElement("style");s.textContent="@page{size:${ticket.widthMm}mm "+Math.max(h,60)+"mm;margin:0}";document.head.appendChild(s);})();`,
        }}
      />
    </>
  );
}
