import { requirePageSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { loadFinderPageData, type FinderPageData } from "@/lib/counter-finder-server";
import AppShell from "@/components/AppShell";
import CounterFinderPlanner from "@/components/CounterFinderPlanner";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CounterFinderPage({
  searchParams
}: {
  searchParams: { boss?: string; nodes?: string; effects?: string; all?: string };
}) {
  const session = await requirePageSession();

  let data: FinderPageData | null = null;
  let dbError: string | null = null;
  try {
    data = await loadFinderPageData(await getDb(), session.userId);
  } catch (err) {
    console.error("Counter Finder page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="page-title">Counter Finder</h1>
      <p className="page-lede">
        Pick a boss or defender and the node effects in play. Your champions are ranked by immunity to what the fight
        inflicts, class advantage, matchup and how built-up they are. Champion data is a best guess and may be out of
        date; entries marked low or medium confidence are worth double-checking.
      </p>
      {dbError ? <DbErrorNotice message={dbError} /> : data && <CounterFinderPlanner initialData={data} initialSearch={searchParams} />}
    </AppShell>
  );
}
