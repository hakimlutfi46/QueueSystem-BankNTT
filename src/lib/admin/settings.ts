import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminError } from "@/lib/admin/errors";
import { notifyQueue } from "@/lib/queue/sql";

const settingsBody = z.object({
  branchName: z.string().trim().min(1).max(80),
  runningText: z.string().trim().max(240),
  voiceEnabled: z.boolean(),
  maxRecall: z.number().int().min(0).max(20),
  targetServiceMinutes: z.number().int().positive().max(240),
  ticketFooter: z.string().trim().max(240),
  ticketWidthMm: z.union([z.literal(58), z.literal(80)]),
});

export type AdminSettings = z.infer<typeof settingsBody>;

const DEFAULTS: AdminSettings = {
  branchName: "Bank NTT",
  runningText: "",
  voiceEnabled: true,
  maxRecall: 3,
  targetServiceMinutes: 10,
  ticketFooter: "",
  ticketWidthMm: 80,
};

export async function readSettings(db: PrismaClient): Promise<AdminSettings> {
  const rows = await db.setting.findMany();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const width = numberValue(values.get("ticket_width_mm"));
  return {
    branchName: stringValue(values.get("branch_name"), DEFAULTS.branchName),
    runningText: stringValue(values.get("running_text"), DEFAULTS.runningText),
    voiceEnabled: values.get("voice_enabled") === false ? false : DEFAULTS.voiceEnabled,
    maxRecall: numberValue(values.get("max_recall")) ?? DEFAULTS.maxRecall,
    targetServiceMinutes: numberValue(values.get("target_service_minutes")) ?? DEFAULTS.targetServiceMinutes,
    ticketFooter: stringValue(values.get("ticket_footer"), DEFAULTS.ticketFooter),
    ticketWidthMm: width === 58 || width === 80 ? width : DEFAULTS.ticketWidthMm,
  };
}

export async function saveSettings(db: PrismaClient, body: unknown): Promise<AdminSettings> {
  const parsed = settingsBody.safeParse(body);
  if (!parsed.success) throw new AdminError("VALIDATION", "Data tidak valid.");
  const entries: Array<{ key: string; value: string | number | boolean }> = [
    { key: "branch_name", value: parsed.data.branchName },
    { key: "running_text", value: parsed.data.runningText },
    { key: "voice_enabled", value: parsed.data.voiceEnabled },
    { key: "max_recall", value: parsed.data.maxRecall },
    { key: "target_service_minutes", value: parsed.data.targetServiceMinutes },
    { key: "ticket_footer", value: parsed.data.ticketFooter },
    { key: "ticket_width_mm", value: parsed.data.ticketWidthMm },
  ];
  await db.$transaction(async (tx) => {
    for (const entry of entries) {
      await tx.setting.upsert({
        where: { key: entry.key },
        create: { key: entry.key, value: entry.value },
        update: { value: entry.value },
      });
    }
    await notifyQueue(tx, { type: "CONFIG_CHANGED" });
  });
  return parsed.data;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
