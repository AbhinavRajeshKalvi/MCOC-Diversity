import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isOfficerRole } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AdminPanel from "@/components/AdminPanel";
import DbErrorNotice from "@/components/DbErrorNotice";

async function loadAdminData() {
  const db = await getDb();

  const userDocs = await db.collection("users").find().sort({ displayName: 1 }).toArray();
  const users = userDocs.map((u) => ({
    id: u._id.toString(),
    username: u.username as string,
    displayName: u.displayName as string,
    role: u.role as "admin" | "leader" | "officer" | "member",
    battlegroup: (u.battlegroup as 1 | 2 | 3 | null) ?? null,
    mustChangePassword: Boolean(u.mustChangePassword)
  }));

  const championDocs = await db.collection("champions").find().sort({ name: 1 }).toArray();
  const champions = championDocs.map((c) => ({
    id: c._id.toString(),
    name: c.name as string,
    imageUrl: (c.imageUrl as string | null) ?? null
  }));

  return { users, champions };
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isOfficerRole(session.role)) redirect("/profile");

  let data: Awaited<ReturnType<typeof loadAdminData>> | null = null;
  let dbError: string | null = null;
  try {
    data = await loadAdminData();
  } catch (err) {
    console.error("Admin page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="font-display text-3xl tracking-wide text-parchment mb-1">Admin</h1>
      <p className="text-sm text-parchment-faint mb-6">
        Manage alliance members, battlegroup placement, and the champion list.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        data && (
          <AdminPanel
            initialUsers={data.users}
            initialChampions={data.champions}
            viewer={{ userId: session.userId, role: session.role }}
          />
        )
      )}
    </AppShell>
  );
}
