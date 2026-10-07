import { KioskScreen } from "@/app/kiosk/kiosk-screen";
import { appTimezone } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function KioskPage() {
  return <KioskScreen timeZone={appTimezone()} />;
}
