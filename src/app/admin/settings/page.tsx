import { headers } from "next/headers";
import { SettingsScreen } from "@/app/admin/settings/settings-screen";
import { readSettings } from "@/lib/admin/settings";
import { deviceToken } from "@/lib/auth/device";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings(getPrisma());
  const origin = await requestOrigin();
  const kiosk = deviceToken("kiosk");
  const display = deviceToken("display");
  return (
    <SettingsScreen
      settings={settings}
      deviceLinks={{
        kiosk: kiosk ? `${origin}/kiosk?token=${encodeURIComponent(kiosk)}` : null,
        display: display ? `${origin}/display?token=${encodeURIComponent(display)}` : null,
      }}
    />
  );
}

async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
