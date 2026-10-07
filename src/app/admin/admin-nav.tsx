"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/counter/actions";

const links = [
  { href: "/admin", label: "Dasbor" },
  { href: "/admin/services", label: "Layanan" },
  { href: "/admin/counters", label: "Loket" },
  { href: "/admin/users", label: "Petugas" },
  { href: "/admin/settings", label: "Pengaturan" },
  { href: "/admin/reports/daily", label: "Laporan" },
];

export function AdminNav({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-brand-navy px-4 py-6 text-brand-white print:hidden">
      <p className="text-lg font-bold">Admin</p>
      <p className="mb-6 text-sm">{name}</p>
      <nav className="flex flex-1 flex-col gap-2">
        {links.map((link) => {
          const section = link.href.startsWith("/admin/reports") ? "/admin/reports" : link.href;
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(section);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "rounded-[var(--radius-card)] bg-brand-blue px-3 py-2 font-bold" : "rounded-[var(--radius-card)] px-3 py-2 font-bold"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <form action={logout}>
        <button type="submit" className="font-bold">
          Keluar
        </button>
      </form>
    </aside>
  );
}
