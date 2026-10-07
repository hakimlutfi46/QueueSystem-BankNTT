import { auth } from "@/auth";

export async function currentOfficer(): Promise<{ id: number; name: string } | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!session?.user || !Number.isInteger(id) || id <= 0) return null;
  return { id, name: session.user.name ?? "" };
}
