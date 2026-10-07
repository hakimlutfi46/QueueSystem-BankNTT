import { loadDailyReport } from "@/lib/reports/query";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  return runAdmin(async () => loadDailyReport(getPrisma(), date));
}
