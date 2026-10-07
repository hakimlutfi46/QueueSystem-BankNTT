import { redirect } from "next/navigation";
import { CounterScreen } from "@/app/counter/counter-screen";
import { auth } from "@/auth";
import { loadCounterDesk } from "@/lib/counters/view";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CounterPage() {
  const session = await auth();
  const officerId = Number(session?.user?.id);
  if (!session?.user || !Number.isInteger(officerId) || officerId <= 0) redirect("/login");

  const desk = await loadCounterDesk(getPrisma(), officerId);
  return (
    <CounterScreen
      officerId={officerId}
      officerName={session.user.name ?? ""}
      initial={desk}
    />
  );
}
