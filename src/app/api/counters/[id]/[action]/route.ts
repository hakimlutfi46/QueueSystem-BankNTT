import { getPrisma } from "@/lib/db";
import { currentOfficer } from "@/lib/auth/session";
import { handleCounterAction } from "@/lib/counters/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const officer = await currentOfficer();
  if (!officer) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Silakan masuk." } },
      { status: 401 },
    );
  }
  const { id, action } = await params;
  return handleCounterAction(getPrisma(), officer.id, id, action);
}
