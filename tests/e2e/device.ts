import "dotenv/config";

export function kioskEntry(): string {
  return withToken("/kiosk", "KIOSK_TOKEN");
}

export function displayEntry(): string {
  return withToken("/display", "DISPLAY_TOKEN");
}

export function ticketEndpoint(base = "http://127.0.0.1:3000"): string {
  const token = process.env.KIOSK_TOKEN?.trim();
  if (!token) throw new Error("KIOSK_TOKEN is not set");
  return `${base}/api/tickets?token=${encodeURIComponent(token)}`;
}

function withToken(path: string, name: "KIOSK_TOKEN" | "DISPLAY_TOKEN"): string {
  const token = process.env[name]?.trim();
  if (!token) throw new Error(`${name} is not set`);
  return `${path}?token=${encodeURIComponent(token)}`;
}
