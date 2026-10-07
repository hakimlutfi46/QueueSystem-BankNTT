import { DisplayScreen } from "@/app/display/display-screen";
import { appTimezone } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DisplayPage() {
  return <DisplayScreen timeZone={appTimezone()} />;
}
