"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandButton } from "@/components/brand/brand-button";
import type { AdminUser } from "@/lib/admin/users";
import { submitAdmin } from "@/app/admin/submit";

const field = "min-h-12 rounded-[var(--radius-card)] border border-brand-grey bg-brand-white px-3";

export function UsersScreen({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    const message = await submitAdmin("/api/admin/users", "POST", {
      username: String(formData.get("username") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "STAFF"),
      isActive: true,
    });
    setError(message);
    if (!message) router.refresh();
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-brand-navy">Petugas</h1>
      {error ? <p role="alert" className="mb-4 font-bold text-danger">{error}</p> : null}
      <form action={save} className="mb-6 grid gap-3 rounded-[var(--radius-card)] bg-brand-white p-4 sm:grid-cols-2">
        <label className="font-bold">
          Nama pengguna
          <input name="username" required className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Nama
          <input name="name" required className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Kata sandi
          <input name="password" type="password" required minLength={6} className={`${field} mt-1 w-full font-normal`} />
        </label>
        <label className="font-bold">
          Peran
          <select name="role" className={`${field} mt-1 w-full font-normal`}>
            <option value="STAFF">Petugas</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <BrandButton type="submit">Tambah petugas</BrandButton>
      </form>
      <ul className="flex flex-col gap-3">
        {users.map((user) => (
          <li key={user.id}>
            <UserEditor user={user} onError={setError} onSaved={() => router.refresh()} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserEditor({
  user,
  onError,
  onSaved,
}: {
  user: AdminUser;
  onError: (message: string | null) => void;
  onSaved: () => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-[var(--radius-card)] bg-brand-white p-4 sm:grid-cols-2"
      action={async (formData) => {
        const password = String(formData.get("password") ?? "");
        const message = await submitAdmin(`/api/admin/users/${user.id}`, "PATCH", {
          username: String(formData.get("username") ?? ""),
          name: String(formData.get("name") ?? ""),
          role: String(formData.get("role") ?? user.role),
          isActive: formData.get("isActive") === "on",
          ...(password ? { password } : {}),
        });
        onError(message);
        if (!message) onSaved();
      }}
    >
      <label className="font-bold">
        Nama pengguna
        <input name="username" required defaultValue={user.username} className={`${field} mt-1 w-full font-normal`} />
      </label>
      <label className="font-bold">
        Nama
        <input name="name" required defaultValue={user.name} className={`${field} mt-1 w-full font-normal`} />
      </label>
      <label className="font-bold">
        Kata sandi baru
        <input name="password" type="password" minLength={6} placeholder="Kosongkan bila tidak diubah" className={`${field} mt-1 w-full font-normal`} />
      </label>
      <label className="font-bold">
        Peran
        <select name="role" defaultValue={user.role} className={`${field} mt-1 w-full font-normal`}>
          <option value="STAFF">Petugas</option>
          <option value="ADMIN">Admin</option>
        </select>
      </label>
      <label className="flex items-center gap-2 font-bold">
        <input name="isActive" type="checkbox" defaultChecked={user.isActive} />
        Aktif
      </label>
      <BrandButton type="submit">Simpan petugas</BrandButton>
    </form>
  );
}
