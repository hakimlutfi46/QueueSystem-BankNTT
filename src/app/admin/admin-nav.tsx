"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/ui/logout-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { DiagonalStripes } from "@/components/brand/diagonal-stripes";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const groups: { label: string; links: { href: string; label: string; icon: IconName }[] }[] = [
  {
    label: "Pantau",
    links: [
      { href: "/admin", label: "Dasbor", icon: "dashboard" },
      { href: "/admin/reports/daily", label: "Laporan", icon: "chart" },
    ],
  },
  {
    label: "Atur cabang",
    links: [
      { href: "/admin/counters", label: "Loket", icon: "desk" },
      { href: "/admin/services", label: "Layanan", icon: "ticket" },
      { href: "/admin/users", label: "Petugas", icon: "users" },
      { href: "/admin/devices", label: "Perangkat", icon: "tv" },
      { href: "/admin/branding", label: "Identitas & tampilan", icon: "layers" },
      { href: "/admin/settings", label: "Pengaturan", icon: "settings" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  const section = href.startsWith("/admin/reports") ? "/admin/reports" : href;
  return pathname.startsWith(section);
}

export function AdminNav({ name, branchName }: { name: string; branchName: string }) {
  const pathname = usePathname();
  const links = groups.flatMap((group) => group.links);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-brand-navy text-brand-white lg:flex print:hidden">
        <div className="px-5 pb-4 pt-6">
          <div className="rounded-xl bg-brand-white p-3">
            <BrandLogo variant="color" priority className="mx-auto h-12" />
          </div>
          <p className="mt-4 truncate font-bold">{branchName}</p>
          <p className="text-sm opacity-80">Panel admin cabang</p>
        </div>
        <DiagonalStripes className="h-1.5" />
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Menu admin">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider opacity-70">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition-colors",
                        active ? "bg-brand-white text-brand-navy" : "hover:bg-brand-blue",
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand-orange" aria-hidden="true" />
                      ) : null}
                      <Icon name={link.icon} />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-brand-blue px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-blue font-bold">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{name}</p>
              <p className="text-xs opacity-80">Admin</p>
            </div>
            <Link
              href="/account/password?next=%2Fadmin"
              className="rounded-lg p-2 hover:bg-brand-blue"
              aria-label="Ganti kata sandi"
              title="Ganti kata sandi"
            >
              <Icon name="lock" />
            </Link>
            <LogoutButton className="rounded-lg p-2 hover:bg-brand-blue">
              <Icon name="logout" />
            </LogoutButton>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-brand-navy text-brand-white shadow-card lg:hidden print:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="rounded-lg bg-brand-white px-2 py-1">
            <BrandLogo variant="color" className="h-7" />
          </div>
          <p className="min-w-0 flex-1 truncate font-bold">{branchName}</p>
          <Link href="/account/password?next=%2Fadmin" className="rounded-lg p-2 hover:bg-brand-blue" aria-label="Ganti kata sandi">
            <Icon name="lock" />
          </Link>
          <LogoutButton className="rounded-lg p-2 hover:bg-brand-blue">
            <Icon name="logout" />
          </LogoutButton>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Menu admin">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold",
                  active ? "bg-brand-white text-brand-navy" : "bg-brand-blue/60",
                )}
              >
                <Icon name={link.icon} className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "A").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}
