import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { BattlegroupBoard } from "@/lib/diversity";
import { loadBattlegroupBoard } from "@/lib/defender-plans";
import AppShell from "@/components/AppShell";
import BattlegroupBoards from "@/components/BattlegroupBoard";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadBoards(): Promise<{ boards: BattlegroupBoard[]; allUsers: {
  userId: string;
  username: string;
  displayName: string;
  battlegroup: 1 | 2 | 3 | null;
}[] }> {
  const db = await getDb();
  const boards: BattlegroupBoard[] = [];
  for (const bg of [1, 2, 3]) {
    boards.push((await loadBattlegroupBoard(db, bg)).board);
  }

  const allUserDocs = await db.collection("users").find().sort({ displayName: 1 }).toArray();
  const allUsers = allUserDocs.map((user) => ({
    userId: user._id.toString(),
    username: user.username as string,
    displayName: user.displayName as string,
    battlegroup: (user.battlegroup as 1 | 2 | 3 | null) ?? null
  }));

  return { boards, allUsers };
}

export default async function BattlegroupsPage({
  searchParams
}: {
  searchParams: { bg?: string; view?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  let loaded: Awaited<ReturnType<typeof loadBoards>> | null = null;
  let dbError: string | null = null;
  try {
    loaded = await loadBoards();
  } catch (err) {
    console.error("Battlegroups page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="font-display text-3xl tracking-wide text-parchment mb-1">Battlegroups</h1>
      <p className="text-sm text-parchment-faint mb-6">
        The suggested plan is built once from your alliance&apos;s best defenders and then stays as officers edit it;
        use Auto-suggest to rebuild it. The Current tab shows the defender list in use. Officers can publish the suggested
        plan to replace the current list.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        loaded && (
          <BattlegroupBoards
            boards={loaded.boards}
            isOfficer={isOfficerRole(session.role)}
            allUsers={isOfficerRole(session.role) ? loaded.allUsers : []}
            initialBattlegroup={Number(searchParams.bg) || 1}
            initialView={searchParams.view === "current" ? "current" : "suggested"}
          />
        )
      )}
    </AppShell>
  );
}
