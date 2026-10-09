import type { Metadata } from "next";
import { connection } from "next/server";
import { BrandingProvider } from "@/components/brand/branding-provider";
import { readPublicBranding } from "@/lib/branding";
import { brandColorCss } from "@/lib/branding-colors";
import { getPrisma } from "@/lib/db";
import "./globals.css";

async function branding() {
  // Identitas dibaca dari database pada setiap permintaan, bukan saat build.
  await connection();
  return readPublicBranding(getPrisma());
}

export async function generateMetadata(): Promise<Metadata> {
  const { orgName } = await branding();
  return {
    title: `Sistem Antrian ${orgName}`,
    description: "Sistem antrian layanan Customer Service dan Teller",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const value = await branding();
  const colors = brandColorCss(value.colors);
  return (
    <html lang="id">
      <body>
        {colors ? <style>{colors}</style> : null}
        <BrandingProvider value={value}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
