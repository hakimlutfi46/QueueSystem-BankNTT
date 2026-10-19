"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAdmin } from "@/app/admin/submit";
import { useLiveRefresh } from "@/app/admin/use-live-refresh";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge } from "@/components/ui/badge";
import { Field, StatusSwitch, Switch, inputClass } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { Icon } from "@/components/ui/icon";
import { Alert, Modal, PageHeader, Panel } from "@/components/ui/panel";
import type { AdminUser } from "@/lib/admin/users";
import { cn } from "@/lib/cn";
import { useQueueState } from "@/lib/realtime/use-queue-state";

type RoleFilter = "all" | "STAFF" | "ADMIN";

export function UsersScreen({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { state } = useQueueState();
  useLiveRefresh(["COUNTER_CHANGED"]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");

  const deskByUser = new Map(
    (state?.counters ?? [])
      .filter((counter) => counter.officerId != null && counter.status !== "CLOSED")
      .map((counter) => [counter.officerId, counter]),
  );
  const needle = query.trim().toLowerCase();
  const visible = users.filter(
    (user) =>
      (role === "all" || user.role === role) &&
      (!needle || user.name.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle)),
  );

  function done(message: string | null, success: string): boolean {
    setError(message);
    setNotice(message ? null : success);
    if (!message) router.refresh();
    return !message;
  }

  async function save(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const message = await submitAdmin("/api/admin/users", "POST", {
      username: String(formData.get("username") ?? ""),
      name,
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "STAFF"),
      isActive: true,
    });
    if (done(message, `${name} ditambahkan.`)) setFormKey((key) => key + 1);
  }

  async function toggle(user: AdminUser) {
    const ok = await confirm(
      user.isActive
        ? {
            title: `Nonaktifkan ${user.name}?`,
            message:
              "Akun yang dinonaktifkan tidak akan bisa masuk ke sistem dan sesi aktifnya akan dihentikan.",
            confirmLabel: "Nonaktifkan",
          }
        : {
            title: `Aktifkan ${user.name}?`,
            message: "Akun ini akan aktif kembali dan bisa masuk ke sistem.",
            confirmLabel: "Aktifkan",
            tone: "primary",
          },
    );
    if (!ok) return;
    const message = await submitAdmin(`/api/admin/users/${user.id}`, "PATCH", { isActive: !user.isActive });
    done(message, user.isActive ? `${user.name} dinonaktifkan.` : `${user.name} diaktifkan.`);
  }

  async function remove(user: AdminUser) {
    const desk = deskByUser.get(user.id);
    if (desk) {
      setError(`Petugas ${user.name} sedang aktif di ${desk.name}. Tutup loket terlebih dahulu sebelum menghapus.`);
      return;
    }
    const ok = await confirm({
      title: `Hapus akun ${user.name}?`,
      message:
        "Akun petugas ini akan dihapus permanen. Data riwayat tiket yang pernah dilayani tetap tersimpan aman.",
      confirmLabel: "Hapus Petugas",
      tone: "danger",
      icon: "trash",
    });
    if (!ok) return;
    const message = await submitAdmin(`/api/admin/users/${user.id}`, "DELETE");
    done(message, `${user.name} berhasil dihapus.`);
  }

  return (
    <section>
      <PageHeader
        title="Petugas"
        description="Kelola akun petugas loket dan admin cabang. Atur status aktif/nonaktif atau hapus akun bila tidak digunakan lagi."
      />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          className="min-w-0"
          bodyClassName="p-0"
          title={`${users.filter((user) => user.isActive).length} akun aktif`}
          actions={
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <span className="sr-only">Cari petugas</span>
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari nama"
                  className={cn(inputClass, "min-h-10 w-44 pl-9")}
                />
              </label>
              <select
                aria-label="Saring peran"
                value={role}
                onChange={(event) => setRole(event.target.value as RoleFilter)}
                className={cn(inputClass, "min-h-10 w-36")}
              >
                <option value="all">Semua peran</option>
                <option value="STAFF">Petugas</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-bold">Nama</th>
                  <th className="px-3 py-3 font-bold">Peran</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Loket sekarang</th>
                  <th className="px-5 py-3" aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => {
                  const desk = deskByUser.get(user.id);
                  return (
                    <tr key={user.id} className="border-t border-line">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              user.isActive ? "bg-navy-soft text-brand-navy" : "bg-surface text-ink-muted",
                            )}
                            aria-hidden="true"
                          >
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold">{user.name}</p>
                            <p className="truncate text-ink-muted">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={user.role === "ADMIN" ? "navy" : "sky"}>{user.role === "ADMIN" ? "Admin" : "Petugas"}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                          <StatusSwitch
                            checked={user.isActive}
                            onChange={() => void toggle(user)}
                          />
                          {user.isActive && user.mustChangePassword ? (
                            <Badge tone="orange" className="w-fit">Wajib ganti sandi</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {desk ? (
                          <span className="font-bold text-brand-navy">
                            {desk.name}
                            {desk.status === "PAUSED" ? <span className="font-normal text-ink-muted"> · istirahat</span> : null}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <BrandButton size="sm" variant="outline" onClick={() => setEditing(user)} ariaLabel={`Ubah ${user.name}`}>
                            <Icon name="edit" className="size-4" />
                            Ubah
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger-soft hover:text-danger"
                            onClick={() => void remove(user)}
                            ariaLabel={`Hapus ${user.name}`}
                          >
                            <Icon name="trash" className="size-4" />
                            Hapus
                          </BrandButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-ink-muted">
                      Tidak ada akun yang cocok.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Panel title="Tambah petugas">
            <form key={formKey} action={save} className="flex flex-col gap-4">
              <Field label="Nama">
                <input name="name" required maxLength={80} className={inputClass} />
              </Field>
              <Field label="Nama pengguna" hint="3–40 karakter: huruf, angka, titik, garis bawah, atau strip">
                <input name="username" required pattern="[A-Za-z0-9._\-]{3,40}" autoComplete="off" className={inputClass} />
              </Field>
              <Field label="Kata sandi sementara" hint="Minimal 6 karakter. Petugas wajib menggantinya saat pertama masuk.">
                <input name="password" type="password" required minLength={6} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Peran">
                <select name="role" className={inputClass}>
                  <option value="STAFF">Petugas</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </Field>
              <BrandButton type="submit">
                <Icon name="plus" />
                Tambah petugas
              </BrandButton>
            </form>
          </Panel>
        </div>
      </div>

      {editing ? (
        <Modal title={`Ubah ${editing.name}`} onClose={() => setEditing(null)}>
          <form
            className="flex flex-col gap-4"
            action={async (formData) => {
              const password = String(formData.get("password") ?? "");
              const name = String(formData.get("name") ?? "");
              const role = String(formData.get("role") ?? editing.role);
              const isActive = formData.get("isActive") === "on";
              const warnings: string[] = [];
              if (editing.isActive && !isActive) warnings.push("Akun ini tidak bisa masuk lagi dan langsung keluar dari semua perangkat.");
              if (role !== editing.role) {
                warnings.push(
                  role === "ADMIN"
                    ? "Akun ini akan bisa mengatur loket, layanan, petugas, perangkat, dan laporan."
                    : "Akun ini tidak bisa membuka halaman Admin lagi.",
                );
              }
              if (password) warnings.push("Kata sandi lama tidak berlaku lagi, dan pemilik akun wajib mengganti sandi baru ini saat masuk.");
              if (warnings.length > 0) {
                const ok = await confirm({
                  title: `Simpan perubahan ${editing.name}?`,
                  message: (
                    <ul className="list-disc space-y-1 pl-4">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ),
                  confirmLabel: "Simpan",
                  tone: editing.isActive && !isActive ? "danger" : "primary",
                  icon: "user",
                });
                if (!ok) return;
              }
              const message = await submitAdmin(`/api/admin/users/${editing.id}`, "PATCH", {
                username: String(formData.get("username") ?? ""),
                name,
                role,
                isActive,
                ...(password ? { password } : {}),
              });
              if (done(message, password ? `${name} disimpan, kata sandi diganti.` : `${name} disimpan.`)) setEditing(null);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama">
                <input name="name" required maxLength={80} defaultValue={editing.name} className={inputClass} />
              </Field>
              <Field label="Nama pengguna">
                <input name="username" required pattern="[A-Za-z0-9._\-]{3,40}" defaultValue={editing.username} className={inputClass} />
              </Field>
            </div>
            <Field label="Kata sandi baru" hint="Kosongkan bila tidak diubah. Sandi dari admin bersifat sementara: pemilik akun wajib menggantinya saat masuk.">
              <input name="password" type="password" minLength={6} autoComplete="new-password" className={inputClass} />
            </Field>
            <Field label="Peran">
              <select name="role" defaultValue={editing.role} className={inputClass}>
                <option value="STAFF">Petugas</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            <Switch name="isActive" label="Akun aktif" description="Akun nonaktif tidak bisa masuk." defaultChecked={editing.isActive} />
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <BrandButton variant="ghost" onClick={() => setEditing(null)}>
                Batal
              </BrandButton>
              <BrandButton type="submit">Simpan petugas</BrandButton>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog}
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
