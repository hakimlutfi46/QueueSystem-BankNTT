import { SettingsScreen } from "@/app/admin/settings/settings-screen";
import { readSettings } from "@/lib/admin/settings";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return <SettingsScreen settings={await readSettings(getPrisma())} />;
}
