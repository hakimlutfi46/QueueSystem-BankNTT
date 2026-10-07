import { UsersScreen } from "@/app/admin/users/users-screen";
import { listUsers } from "@/lib/admin/users";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  return <UsersScreen users={await listUsers(getPrisma())} />;
}
