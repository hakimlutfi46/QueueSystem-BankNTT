"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestAdmin, submitAdmin } from "@/app/admin/submit";
import { BrandButton } from "@/components/brand/brand-button";
import { Badge } from "@/components/ui/badge";
import { Field, inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Alert, EmptyState, Modal, PageHeader, Panel } from "@/components/ui/panel";
import type { DeviceKind } from "@/lib/auth/device";
import type { AdminDevice, IssuedDevice } from "@/lib/auth/devices";
import { cn } from "@/lib/cn";
import { copyText, selectContents } from "@/lib/copy-text";
import { useNow } from "@/lib/use-now";

const KINDS: { kind: DeviceKind; label: string; icon: "touch" | "tv"; path: string; hint: string }[] = [
  { kind: "kiosk", label: "Kiosk tiket", icon: "touch", path: "/kiosk", hint: "Layar sentuh tempat nasabah mengambil nomor." },
  { kind: "display", label: "Layar TV", icon: "tv", path: "/display", hint: "TV ruang tunggu yang menampilkan dan membacakan panggilan." },
];

/** Dianggap tersambung bila perangkat meminta data dalam 3 menit terakhir. */
const ONLINE_MS = 3 * 60 * 1000;

export function DevicesScreen({
  devices,
  envFallback,
}: {
  devices: AdminDevice[];
  envFallback: { kiosk: boolean; display: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedDevice | null>(null);
  const [renaming, setRenaming] = useState<AdminDevice | null>(null);
  const [revoking, setRevoking] = useState<AdminDevice | null>(null);
  const [kind, setKind] = useState<DeviceKind>("kiosk");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  // Waktu "terakhir aktif" dicatat server; muat ulang sesekali supaya status tersambung tetap segar.
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  function done(message: string | null, success: string): boolean {
    setError(message);
    setNotice(message ? null : success);
    if (!message) router.refresh();
    return !message;
  }

  async function create() {
    setPending(true);
    const result = await requestAdmin<IssuedDevice>("/api/admin/devices", "POST", { kind, name });
    setPending(false);
    if (done(result.error, `${name} didaftarkan.`) && result.data) {
      setIssued(result.data);
      setName("");
    }
  }

  async function rotate(device: AdminDevice) {
    const result = await requestAdmin<IssuedDevice>(`/api/admin/devices/${device.id}/rotate`, "POST", {});
    if (done(result.error, `Tautan baru untuk ${device.name} dibuat. Tautan lama tidak berlaku lagi.`) && result.data) {
      setIssued(result.data);
    }
  }

  const active = devices.filter((device) => !device.revokedAt);
  const revoked = devices.filter((device) => device.revokedAt);

  return (
    <section>
      <PageHeader
        title="Perangkat"
        description="Kiosk dan TV tidak memakai login. Daftarkan tiap perangkat di sini, lalu buka tautan pemasangannya sekali di perangkat itu."
      />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {KINDS.map((item) => {
            const list = active.filter((device) => device.kind === item.kind);
            return (
              <Panel
                key={item.kind}
                title={item.label}
                description={item.hint}
                actions={<Badge tone="navy">{list.length} terdaftar</Badge>}
                bodyClassName="p-0"
              >
                {list.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={item.icon}
                      title={`Belum ada ${item.label.toLowerCase()}`}
                      description={
                        envFallback[item.kind]
                          ? "Token cadangan dari berkas .env masih berlaku. Daftarkan perangkat di sini supaya bisa dicabut satu per satu."
                          : "Daftarkan dari panel di samping."
                      }
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        icon={item.icon}
                        onRename={() => setRenaming(device)}
                        onRotate={() => void rotate(device)}
                        onRevoke={() => setRevoking(device)}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}

          {revoked.length > 0 ? (
            <Panel title="Dicabut" description="Perangkat ini tidak bisa membuka kiosk atau TV. Buat tautan baru untuk mengaktifkannya lagi." bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {revoked.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    icon={device.kind === "kiosk" ? "touch" : "tv"}
                    onRename={() => setRenaming(device)}
                    onRotate={() => void rotate(device)}
                    onRevoke={() => undefined}
                  />
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Daftarkan perangkat">
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis perangkat">
                {KINDS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="radio"
                    aria-checked={kind === item.kind}
                    onClick={() => setKind(item.kind)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-bold transition-colors",
                      kind === item.kind ? "border-brand-navy bg-navy-soft text-brand-navy" : "border-line text-ink-muted hover:border-brand-blue",
                    )}
                  >
                    <Icon name={item.icon} className="size-6" />
                    {item.label}
                  </button>
                ))}
              </div>
              <Field label="Nama perangkat" hint="Contoh: Kiosk Lobi, TV Ruang Tunggu Lantai 2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={60}
                  className={inputClass}
                />
              </Field>
              <BrandButton type="submit" disabled={pending || !name.trim()}>
                <Icon name="link" />
                Buat tautan pemasangan
              </BrandButton>
            </form>
          </Panel>
          <p className="px-1 text-xs text-ink-muted">
            Token dibuat acak oleh server dan hanya ditampilkan sekali. Yang disimpan hanya sidik token, jadi tautan
            yang hilang tidak bisa dilihat lagi. Buat tautan baru bila perlu memasang ulang.
          </p>
        </div>
      </div>

      {issued ? <IssuedModal issued={issued} onClose={() => setIssued(null)} /> : null}

      {renaming ? (
        <Modal title="Ganti nama perangkat" onClose={() => setRenaming(null)}>
          <form
            className="flex flex-col gap-4"
            action={async (formData) => {
              const nextName = String(formData.get("name") ?? "");
              const message = await submitAdmin(`/api/admin/devices/${renaming.id}`, "PATCH", { name: nextName });
              if (done(message, `${nextName} disimpan.`)) setRenaming(null);
            }}
          >
            <Field label="Nama perangkat">
              <input name="name" required maxLength={60} defaultValue={renaming.name} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <BrandButton variant="ghost" onClick={() => setRenaming(null)}>
                Batal
              </BrandButton>
              <BrandButton type="submit">Simpan</BrandButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {revoking ? (
        <Modal title={`Cabut ${revoking.name}?`} onClose={() => setRevoking(null)}>
          <p className="text-sm">
            Perangkat ini langsung kehilangan akses dan menampilkan &quot;Perangkat belum diizinkan&quot; pada permintaan
            berikutnya. Pakai ini bila perangkat hilang, dipindah, atau tautannya tersebar.
          </p>
          <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
            <BrandButton variant="ghost" onClick={() => setRevoking(null)}>
              Batal
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={async () => {
                const target = revoking;
                const message = await submitAdmin(`/api/admin/devices/${target.id}/revoke`, "POST", {});
                if (done(message, `${target.name} dicabut.`)) setRevoking(null);
              }}
            >
              <Icon name="power" className="size-4" />
              Cabut izin
            </BrandButton>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function DeviceRow({
  device,
  icon,
  onRename,
  onRotate,
  onRevoke,
}: {
  device: AdminDevice;
  icon: "touch" | "tv";
  onRename: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const now = useNow();
  const seen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : null;
  const online = !device.revokedAt && seen != null && now > 0 && now - seen < ONLINE_MS;

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4" data-testid={`device-${device.id}`}>
      <span
        className={cn(
          "relative flex size-11 shrink-0 items-center justify-center rounded-xl",
          device.revokedAt ? "bg-surface text-ink-muted" : "bg-navy-soft text-brand-navy",
        )}
      >
        <Icon name={icon} />
        {online ? <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-brand-white bg-success" aria-hidden="true" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{device.name}</p>
        <p className="text-sm text-ink-muted">
          {device.revokedAt
            ? `Dicabut ${relative(device.revokedAt, now)}`
            : seen == null
              ? "Belum pernah dibuka"
              : online
                ? "Tersambung"
                : `Terakhir aktif ${relative(device.lastSeenAt, now)}`}
          <span className="font-mono"> · token …{device.tokenHint}</span>
        </p>
      </div>
      {device.revokedAt ? (
        <Badge tone="danger" dot>Dicabut</Badge>
      ) : online ? (
        <Badge tone="success" dot>Tersambung</Badge>
      ) : seen == null ? (
        <Badge tone="orange" dot>Belum dipasang</Badge>
      ) : (
        <Badge tone="muted" dot>Tidak aktif</Badge>
      )}
      <div className="flex flex-wrap gap-2">
        <BrandButton size="sm" variant="ghost" onClick={onRename} ariaLabel={`Ganti nama ${device.name}`}>
          <Icon name="edit" className="size-4" />
          Ganti nama
        </BrandButton>
        <BrandButton size="sm" variant="outline" onClick={onRotate} ariaLabel={`Buat tautan baru untuk ${device.name}`}>
          <Icon name="repeat" className="size-4" />
          {device.revokedAt ? "Aktifkan lagi" : "Tautan baru"}
        </BrandButton>
        {device.revokedAt ? null : (
          <BrandButton size="sm" variant="danger" onClick={onRevoke} ariaLabel={`Cabut ${device.name}`}>
            <Icon name="power" className="size-4" />
            Cabut
          </BrandButton>
        )}
      </div>
    </li>
  );
}

/** Tautan pemasangan, ditampilkan sekali. Alamat server bisa diganti, misalnya dari localhost ke IP cabang. */
function IssuedModal({ issued, onClose }: { issued: IssuedDevice; onClose: () => void }) {
  const [origin, setOrigin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const [copied, setCopied] = useState<"link" | "command" | null>(null);
  const [manual, setManual] = useState<"link" | "command" | null>(null);
  const linkRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLElement>(null);
  const kind = KINDS.find((item) => item.kind === issued.device.kind) ?? KINDS[0];
  const base = origin.trim().replace(/\/+$/, "");
  const link = `${base}${kind.path}?token=${encodeURIComponent(issued.token)}`;
  const command =
    issued.device.kind === "kiosk"
      ? `google-chrome --kiosk --kiosk-printing --app="${link}"`
      : `google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app="${link}"`;

  async function copy(text: string, what: "link" | "command") {
    if (await copyText(text)) {
      setManual(null);
      setCopied(what);
      window.setTimeout(() => setCopied((current) => (current === what ? null : current)), 2000);
      return;
    }
    // Browser menolak menyalin: pilih teksnya supaya admin tinggal menekan Ctrl+C atau Cmd+C.
    setCopied(null);
    setManual(what);
    selectContents(what === "link" ? linkRef.current : commandRef.current);
  }

  return (
    <Modal wide title={`Tautan pemasangan ${issued.device.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-xl bg-orange-soft px-4 py-3 text-sm font-bold text-ink">
          <Icon name="lock" className="mt-0.5 size-4" />
          Simpan atau buka tautan ini sekarang. Setelah dialog ditutup, token tidak bisa dilihat lagi.
        </p>
        <Field label="Alamat server" hint="Ganti dengan IP server cabang bila perangkat dibuka dari komputer lain, misalnya http://192.168.1.10:3000">
          <input value={origin} onChange={(event) => setOrigin(event.target.value)} className={cn(inputClass, "font-mono text-sm")} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-bold">Tautan</p>
          <div className="flex gap-2">
            <code
              ref={linkRef}
              className="min-w-0 flex-1 select-all break-all rounded-xl bg-surface px-3 py-3 text-xs"
              data-testid="device-link"
            >
              {link}
            </code>
            <CopyButton state={copied === "link" ? "copied" : "idle"} onClick={() => void copy(link, "link")} />
          </div>
          {manual === "link" ? <ManualCopyHint /> : null}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold">Perintah Chrome layar penuh</p>
          <div className="flex gap-2">
            <code ref={commandRef} className="min-w-0 flex-1 select-all break-all rounded-xl bg-surface px-3 py-3 text-xs">
              {command}
            </code>
            <CopyButton state={copied === "command" ? "copied" : "idle"} onClick={() => void copy(command, "command")} />
          </div>
          {manual === "command" ? <ManualCopyHint /> : null}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Buka tautan di perangkat {issued.device.kind === "kiosk" ? "kiosk" : "TV"} sekali. Browser menyimpan izinnya.</li>
          {issued.device.kind === "kiosk" ? (
            <li>Jadikan printer thermal sebagai printer default supaya tiket tercetak tanpa dialog.</li>
          ) : (
            <li>Tekan Aktifkan suara sekali supaya panggilan dibacakan.</li>
          )}
          <li>Status di halaman ini berubah menjadi Tersambung.</li>
        </ol>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <BrandButton href={link} variant="ghost" ariaLabel="Buka tautan di tab ini">
            Buka di sini
          </BrandButton>
          <BrandButton onClick={onClose}>Selesai</BrandButton>
        </div>
      </div>
    </Modal>
  );
}

function CopyButton({ state, onClick }: { state: "idle" | "copied"; onClick: () => void }) {
  return (
    <BrandButton variant={state === "copied" ? "primary" : "outline"} onClick={onClick}>
      <Icon name={state === "copied" ? "check" : "copy"} className="size-4" />
      <span aria-live="polite">{state === "copied" ? "Tersalin" : "Salin"}</span>
    </BrandButton>
  );
}

function ManualCopyHint() {
  return (
    <p role="status" className="mt-1.5 text-xs font-bold text-ink">
      Browser menolak menyalin otomatis. Teksnya sudah dipilih, tekan Ctrl+C (Windows) atau Cmd+C (Mac).
    </p>
  );
}

function relative(iso: string | null, now: number): string {
  if (!iso || now === 0) return "";
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}
