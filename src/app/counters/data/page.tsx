import { requirePageSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { loadOverrides } from "@/lib/counter-finder-server";
import type { DataOverride } from "@/lib/counter-finder-data";
import AppShell from "@/components/AppShell";
import CounterDataEditor from "@/components/CounterDataEditor";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CounterDataPage() {
  const session = await requirePageSession();

  let overrides: DataOverride[] | null = null;
  let dbError: string | null = null;
  try {
    overrides = await loadOverrides(await getDb());
  } catch (err) {
    console.error("Counter data page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="page-title">Counter Data</h1>
      <p className="page-lede">
        The champions, bosses, nodes and effects behind the Counter Finder. View any entry as JSON, save corrections,
        and export the merged files.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        overrides && <CounterDataEditor initialOverrides={overrides} canEdit={session.gameDataEditor} />
      )}
    </AppShell>
  );
}
