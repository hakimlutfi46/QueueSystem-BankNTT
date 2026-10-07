import { loadRangeReport } from "@/lib/reports/query";
import { getPrisma } from "@/lib/db";
import { runAdmin } from "@/app/api/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  return runAdmin(async () => loadRangeReport(getPrisma(), search.get("from") ?? "", search.get("to") ?? ""));
}
