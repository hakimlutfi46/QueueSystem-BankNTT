import { BrandingScreen } from "@/app/admin/branding/branding-screen";
import { readBranding } from "@/lib/branding";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  return <BrandingScreen branding={await readBranding(getPrisma())} />;
}
