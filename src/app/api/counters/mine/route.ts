import { getPrisma } from "@/lib/db";
import { currentOfficer } from "@/lib/auth/session";
import { loadCounterDesk } from "@/lib/counters/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const officer = await currentOfficer();
  if (!officer) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Silakan masuk." } },
      { status: 401 },
    );
  }
  return Response.json(await loadCounterDesk(getPrisma(), officer.id));
}
