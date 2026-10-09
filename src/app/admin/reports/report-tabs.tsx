import Link from "next/link";
import { cn } from "@/lib/cn";

export function ReportTabs({ active }: { active: "daily" | "range" }) {
  const tabs = [
    { key: "daily", href: "/admin/reports/daily", label: "Harian" },
    { key: "range", href: "/admin/reports/range", label: "Rentang tanggal" },
  ] as const;
  return (
    <nav className="mb-4 inline-flex gap-1 rounded-xl bg-brand-white p-1 shadow-card print:hidden" aria-label="Jenis laporan">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-bold",
            tab.key === active ? "bg-brand-navy text-brand-white" : "text-ink-muted hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
