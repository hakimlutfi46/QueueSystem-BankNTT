import os from "node:os";

/**
 * Alamat IPv4 server di jaringan lokal, untuk ditampilkan di Admin saat halaman dibuka lewat localhost.
 * Perangkat lain (kiosk, TV) tidak bisa memakai "localhost", karena bagi mereka itu berarti dirinya sendiri.
 * Alamat jaringan pribadi (192.168.x, 10.x, 172.16–31.x) didahulukan.
 */
export function lanAddresses(interfaces = os.networkInterfaces()): string[] {
  const found = new Set<string>();
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) found.add(entry.address);
    }
  }
  return [...found].sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

function isPrivate(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b !== undefined && b >= 16 && b <= 31);
}

/** "localhost:3000" atau "127.0.0.1" dibuka dari server sendiri, jadi alamatnya tidak berguna untuk perangkat lain. */
export function isLoopbackHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || name === "::1" || name.startsWith("127.");
}

/** "192.168.1.52:3000" untuk tiap alamat jaringan, dengan port yang sama seperti halaman yang dibuka. */
export function lanHosts(requestHost: string | null, addresses = lanAddresses()): string[] {
  const port = requestHost?.match(/:(\d+)$/)?.[1];
  return addresses.map((ip) => (port ? `${ip}:${port}` : ip));
}
