import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { BattlegroupBoard } from "@/lib/diversity";
import { loadBattlegroupBoard } from "@/lib/defender-plans";
import { getWarMode } from "@/lib/war-settings";
import { loadDefenderNodes } from "@/lib/defender-nodes";
import type { WarMode } from "@/lib/war-mode";
import AppShell from "@/components/AppShell";
import BattlegroupBoards from "@/components/BattlegroupBoard";
import DbErrorNotice from "@/components/DbErrorNotice";
import WarModeSwitch from "@/components/WarModeSwitch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadBoards(): Promise<{
  mode: WarMode;
  boards: BattlegroupBoard[];
  defenderNodes: Record<number, Record<string, number>>;
  allUsers: {
    userId: string;
    username: string;
    displayName: string;
    battlegroup: 1 | 2 | 3 | null;
  }[];
}> {
  const db = await getDb();
  const mode = await getWarMode(db);
  const boards: BattlegroupBoard[] = [];
  // Big Things only: which node each member's defender sits on.
  const defenderNodes: Record<number, Record<string, number>> = {};
  for (const bg of [1, 2, 3]) {
    boards.push((await loadBattlegroupBoard(db, bg, mode)).board);
    if (mode === "bigThings") defenderNodes[bg] = await loadDefenderNodes(db, bg);
  }

  const allUserDocs = await db.collection("users").find().sort({ displayName: 1 }).toArray();
  const allUsers = allUserDocs.map((user) => ({
    userId: user._id.toString(),
    username: user.username as string,
    displayName: user.displayName as string,
    battlegroup: (user.battlegroup as 1 | 2 | 3 | null) ?? null
  }));

  return { mode, boards, defenderNodes, allUsers };
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

  const isOfficer = isOfficerRole(session.role);
  const bigThings = loaded?.mode === "bigThings";

  return (
    <AppShell session={session}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-x-6 gap-y-3 mb-6">
        <div className="min-w-0">
          <h1 className="page-title">Battlegroups</h1>
          <p className="page-lede !mb-0">
            {bigThings && "Big Things war: every member places 1 defender, and officers pick which of the 10 nodes it goes on. "}
            The suggested plan is built once from your alliance&apos;s best defenders and then stays as officers edit it;
            use Auto-suggest to rebuild it. The Current tab shows the defender list in use. Officers can publish the
            suggested plan to replace the current list.
          </p>
        </div>
        {loaded && <WarModeSwitch mode={loaded.mode} isOfficer={isOfficer} />}
      </div>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        loaded && (
          <BattlegroupBoards
            // Remount on a mode switch so the board fades in fresh.
            key={loaded.mode}
            mode={loaded.mode}
            boards={loaded.boards}
            defenderNodes={loaded.defenderNodes}
            isOfficer={isOfficer}
            allUsers={isOfficer ? loaded.allUsers : []}
            initialBattlegroup={Number(searchParams.bg) || 1}
            initialView={searchParams.view === "current" ? "current" : "suggested"}
          />
        )
      )}
    </AppShell>
  );
}
