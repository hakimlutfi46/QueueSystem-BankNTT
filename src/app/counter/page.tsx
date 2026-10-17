import { redirect } from "next/navigation";
import { CounterScreen } from "@/app/counter/counter-screen";
import { changePasswordUrl, currentUser } from "@/lib/auth/session";
import { loadCounterDesk } from "@/lib/counters/view";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CounterPage() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=%2Fcounter");
  if (user.mustChangePassword) redirect(changePasswordUrl("/counter"));

  const desk = await loadCounterDesk(getPrisma(), user.id);
  return (
    <CounterScreen
      officerId={user.id}
      officerName={user.name}
      initial={desk}
    />
  );
}
