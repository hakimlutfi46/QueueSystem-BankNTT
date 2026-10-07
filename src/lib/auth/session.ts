import { auth } from "@/auth";

export type SessionUser = {
  id: number;
  name: string;
  role: "ADMIN" | "STAFF";
};

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!session?.user || !Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    name: session.user.name ?? "",
    role: session.user.role === "ADMIN" ? "ADMIN" : "STAFF",
  };
}

export async function currentOfficer(): Promise<{ id: number; name: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  return { id: user.id, name: user.name };
}

export function adminDenied(user: SessionUser | null): Response | null {
  if (!user) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Silakan masuk." } },
      { status: 401 },
    );
  }
  if (user.role !== "ADMIN") {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Halaman ini hanya untuk admin." } },
      { status: 403 },
    );
  }
  return null;
}
