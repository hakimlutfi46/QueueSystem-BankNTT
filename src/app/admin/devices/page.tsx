import { headers } from "next/headers";
import { DevicesScreen } from "@/app/admin/devices/devices-screen";
import { deviceToken } from "@/lib/auth/device";
import { listDevices } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { kioskAppOverview } from "@/lib/kiosk/overview";
import { isLoopbackHost, lanHosts } from "@/lib/server-address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const db = getPrisma();
  const [devices, kioskApp, requestHeaders] = await Promise.all([listDevices(db), kioskAppOverview(db), headers()]);
  // Admin dibuka lewat localhost di server: tawarkan IP jaringan server, karena kiosk dan TV tidak bisa
  // membuka "localhost" milik server.
  const host = requestHeaders.get("host");
  const serverHosts = host && isLoopbackHost(host) ? lanHosts(host) : [];
  return (
    <DevicesScreen
      devices={devices}
      envFallback={{ kiosk: Boolean(deviceToken("kiosk")), display: Boolean(deviceToken("display")) }}
      kioskApp={kioskApp}
      serverHosts={serverHosts}
    />
  );
}
