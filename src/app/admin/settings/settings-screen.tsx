"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandButton } from "@/components/brand/brand-button";
import type { AdminSettings } from "@/lib/admin/settings";
import { submitAdmin } from "@/app/admin/submit";

const field = "min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3";

export function SettingsScreen({ settings }: { settings: AdminSettings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    const message = await submitAdmin("/api/admin/settings", "PUT", {
      branchName: String(formData.get("branchName") ?? ""),
      runningText: String(formData.get("runningText") ?? ""),
      voiceEnabled: formData.get("voiceEnabled") === "on",
      maxRecall: Number(formData.get("maxRecall") ?? 0),
      targetServiceMinutes: Number(formData.get("targetServiceMinutes") ?? 0),
      ticketFooter: String(formData.get("ticketFooter") ?? ""),
      ticketWidthMm: Number(formData.get("ticketWidthMm") ?? 80),
    });
    setError(message);
    if (!message) router.refresh();
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-brand-navy">Pengaturan</h1>
      {error ? <p role="alert" className="mb-4 font-bold text-danger">{error}</p> : null}
      <form action={save} className="grid max-w-xl gap-3 rounded-[var(--radius-card)] bg-brand-white p-4">
        <label className="font-bold">
          Nama cabang
          <input name="branchName" required defaultValue={settings.branchName} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Teks berjalan
          <input name="runningText" defaultValue={settings.runningText} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="flex items-center gap-2 font-bold">
          <input name="voiceEnabled" type="checkbox" defaultChecked={settings.voiceEnabled} />
          Suara panggilan hidup
        </label>
        <label className="font-bold">
          Batas panggil ulang
          <input name="maxRecall" type="number" min={0} required defaultValue={settings.maxRecall} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Target lama penanganan (menit)
          <input name="targetServiceMinutes" type="number" min={1} required defaultValue={settings.targetServiceMinutes} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Teks kaki tiket
          <input name="ticketFooter" defaultValue={settings.ticketFooter} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Lebar kertas
          <select name="ticketWidthMm" defaultValue={settings.ticketWidthMm} className={`${field} mt-1 w-full font-normal`}>
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </label>
        <BrandButton type="submit">Simpan pengaturan</BrandButton>
      </form>
    </section>
  );
}
