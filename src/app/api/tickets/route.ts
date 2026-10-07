import { getPrisma } from "@/lib/db";
import { issueTicketResponse } from "@/lib/tickets/issue-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return issueTicketResponse(getPrisma(), body);
}
