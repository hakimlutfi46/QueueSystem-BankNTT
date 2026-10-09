import { KioskScreen } from "@/app/kiosk/kiosk-screen";
import { appTimezone } from "@/lib/env";
import { ticketOutput } from "@/lib/print/output";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function KioskPage() {
  return <KioskScreen timeZone={appTimezone()} output={ticketOutput()} />;
}
