import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { getDb, type ObjectId } from "@/lib/db";
import { listAllianceMembers } from "@/lib/members";
import { isOfficerRole } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AdminPanel from "@/components/AdminPanel";
import DbErrorNotice from "@/components/DbErrorNotice";

async function loadAdminData(allianceId: ObjectId) {
  const db = await getDb();

  const users = await listAllianceMembers(db, allianceId);

  const championDocs = await db.collection("champions").find().sort({ name: 1 }).toArray();
  const champions = championDocs.map((c) => ({
    id: c._id.toString(),
    name: c.name as string,
    imageUrl: (c.imageUrl as string | null) ?? null
  }));

  return { users, champions };
}

export default async function AdminPage() {
  const session = await requirePageSession();
  if (!isOfficerRole(session.role)) redirect("/profile");

  let data: Awaited<ReturnType<typeof loadAdminData>> | null = null;
  let dbError: string | null = null;
  try {
    data = await loadAdminData(session.alliance);
  } catch (err) {
    console.error("Admin page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="page-title">Admin</h1>
      <p className="page-lede">
        Manage your alliance&apos;s members, battlegroup placement and rosters.
        {session.gameDataEditor && " You can also edit the champion list every alliance uses."} New members join with the
        alliance code on the Alliance page.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        data && (
          <AdminPanel
            initialUsers={data.users}
            initialChampions={data.champions}
            viewer={{ userId: session.userId, role: session.role }}
            canEditChampions={session.gameDataEditor}
          />
        )
      )}
    </AppShell>
  );
}
