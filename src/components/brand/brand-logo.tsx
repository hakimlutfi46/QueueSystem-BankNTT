"use client";

import { useBranding } from "@/components/brand/branding-provider";
import { cn } from "@/lib/cn";

/** Logo lembaga dari Admin → Identitas & tampilan, atau logo bawaan. */
export function BrandLogo({
  className,
  priority = false,
}: {
  variant?: "color" | "onBlue";
  className?: string;
  priority?: boolean;
}) {
  const { logoSrc, orgName } = useBranding();
  return (
    // Logo unggahan berukuran bebas dan sudah disimpan kecil, jadi tidak lewat pengoptimal gambar Next.js.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoSrc}
      alt={orgName}
      fetchPriority={priority ? "high" : undefined}
      className={cn("w-auto object-contain", className ?? "h-16")}
    />
  );
}

/** Slogan lembaga, misalnya "melayani lebih sungguh". Kosong bila admin mengosongkannya. */
export function BrandTagline({ className }: { className?: string }) {
  const { tagline } = useBranding();
  return tagline ? <p className={className}>{tagline}</p> : null;
}
