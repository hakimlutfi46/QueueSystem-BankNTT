import { terbilang, terbilangParts } from "@/lib/speech/terbilang";

export type AnnouncementScript = {
  text: string;
  clips: string[];
};

export function announcementScript(
  ticketNumber: string,
  counterName: string,
  displayNumber: number,
): AnnouncementScript {
  const parsed = /^([A-Za-z]+)(\d+)$/.exec(ticketNumber.trim());
  const prefix = parsed?.[1]?.toUpperCase() ?? "";
  const sequence = parsed ? Number(parsed[2]) : null;
  const numberWords =
    prefix && sequence != null && Number.isInteger(sequence) ? terbilang(sequence) : ticketNumber.trim();
  const spokenNumber = prefix ? `${prefix}, ${numberWords}` : numberWords;
  const counterWords = speakCounter(counterName, displayNumber);
  const text = `Nomor antrian ${spokenNumber}. Silakan menuju loket ${counterWords}.`;
  const clips = [
    clip("nomor-antrian"),
    ...(prefix ? [clip(prefix.toLowerCase())] : []),
    ...(sequence != null && Number.isInteger(sequence)
      ? terbilangParts(sequence).map(clip)
      : []),
    clip("silakan-menuju-loket"),
    ...counterWords.split(" ").filter(Boolean).map((word) => clip(word.toLowerCase())),
  ];
  return { text, clips };
}

function speakCounter(name: string, displayNumber: number): string {
  let cleaned = name.trim();
  // "Customer Service 1" -> "CS 1" (sejalan dengan klip cs.wav yang ada)
  if (/^customer\s+service\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/^customer\s+service\b/i, "CS");
  }
  // Bila nama loket berawalan "Loket", hilangkan kata "Loket" agar tidak terdengar
  // ganda setelah kalimat "Silakan menuju loket..."
  if (/^loket\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/^loket\b/i, "").trim();
  }
  const words = cleaned
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const spoken = Number.isInteger(displayNumber) && displayNumber >= 0 ? terbilang(displayNumber) : "";
  return [...words, spoken].filter(Boolean).join(" ");
}

function clip(name: string): string {
  return `/audio/${name}.wav`;
}
