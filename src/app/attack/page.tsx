import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { AttackBoard } from "@/lib/attack-map";
import { loadAttackBoard } from "@/lib/attack-plans";
import { getWarMode } from "@/lib/war-settings";
import type { WarMode } from "@/lib/war-mode";
import AppShell from "@/components/AppShell";
import AttackMap from "@/components/AttackMap";
import DbErrorNotice from "@/components/DbErrorNotice";
import WarModeSwitch from "@/components/WarModeSwitch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAttack(
  userId: string
): Promise<{ mode: WarMode; boards: AttackBoard[]; myBattlegroup: number | null }> {
  const db = await getDb();
  const mode = await getWarMode(db);
  const boards = await Promise.all(([1, 2, 3] as const).map((bg) => loadAttackBoard(db, bg, mode)));
  const mine = boards.find((board) => board.members.some((member) => member.userId === userId));
  return { mode, boards, myBattlegroup: mine?.battlegroup ?? null };
}

export default async function AttackPage({ searchParams }: { searchParams: { bg?: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  let loaded: Awaited<ReturnType<typeof loadAttack>> | null = null;
  let dbError: string | null = null;
  try {
    loaded = await loadAttack(session.userId);
  } catch (err) {
    console.error("Attack page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  const isOfficer = isOfficerRole(session.role);

  return (
    <AppShell session={session}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-x-6 gap-y-3 mb-6">
        <div className="min-w-0">
          <h1 className="page-title">Attack</h1>
          <p className="page-lede !mb-0">
            {loaded?.mode === "bigThings"
              ? "Who attacks where in each battlegroup. The Big Things map has 10 nodes on five islands, and everyone can pick their own spots."
              : "Who attacks where in each battlegroup. Officers assign the nine attack paths; everyone can pick their own spot on the diamond islands and the boss island."}
          </p>
        </div>
        {loaded && <WarModeSwitch mode={loaded.mode} isOfficer={isOfficer} />}
      </div>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        loaded && (
          <AttackMap
            // Remount on a mode switch so the new map fades in fresh.
            key={loaded.mode}
            mode={loaded.mode}
            boards={loaded.boards}
            viewerId={session.userId}
            isOfficer={isOfficer}
            initialBattlegroup={Number(searchParams.bg) || loaded.myBattlegroup || 1}
          />
        )
      )}
    </AppShell>
  );
}
