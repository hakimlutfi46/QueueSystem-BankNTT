import { createCounter, createCounters, listCounters } from "@/lib/admin/counters";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runAdmin(async () => ({ counters: await listCounters(getPrisma()) }));
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (body && typeof body === "object" && "items" in body) {
    return runAdmin(async () => ({ counters: await createCounters(getPrisma(), body) }));
  }
  return runAdmin(async () => ({ counter: await createCounter(getPrisma(), body) }));
}
