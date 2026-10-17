import { DevicesScreen } from "@/app/admin/devices/devices-screen";
import { deviceToken } from "@/lib/auth/device";
import { listDevices } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";
import { kioskAppOverview } from "@/lib/kiosk/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const db = getPrisma();
  const [devices, kioskApp] = await Promise.all([listDevices(db), kioskAppOverview(db)]);
  return (
    <DevicesScreen
      devices={devices}
      envFallback={{ kiosk: Boolean(deviceToken("kiosk")), display: Boolean(deviceToken("display")) }}
      kioskApp={kioskApp}
    />
  );
}
