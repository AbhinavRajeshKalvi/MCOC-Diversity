import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { AttackBoard } from "@/lib/attack-map";
import { loadAttackBoard } from "@/lib/attack-plans";
import AppShell from "@/components/AppShell";
import AttackMap from "@/components/AttackMap";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAttack(userId: string): Promise<{ boards: AttackBoard[]; myBattlegroup: number | null }> {
  const db = await getDb();
  const boards = await Promise.all(([1, 2, 3] as const).map((bg) => loadAttackBoard(db, bg)));
  const mine = boards.find((board) => board.members.some((member) => member.userId === userId));
  return { boards, myBattlegroup: mine?.battlegroup ?? null };
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
      <h1 className="page-title">Attack</h1>
      <p className="page-lede">
        Who attacks where in each battlegroup. Officers assign the nine attack paths; everyone can pick their own spot on
        the diamond islands and the boss island.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        loaded && (
          <AttackMap
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
