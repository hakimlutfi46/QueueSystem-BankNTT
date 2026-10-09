import { DevicesScreen } from "@/app/admin/devices/devices-screen";
import { deviceToken } from "@/lib/auth/device";
import { listDevices } from "@/lib/auth/devices";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const devices = await listDevices(getPrisma());
  return (
    <DevicesScreen
      devices={devices}
      envFallback={{ kiosk: Boolean(deviceToken("kiosk")), display: Boolean(deviceToken("display")) }}
    />
  );
}
