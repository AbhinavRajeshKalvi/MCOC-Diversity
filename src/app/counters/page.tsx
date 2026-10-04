import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCounterData } from "@/lib/counter-data";
import AppShell from "@/components/AppShell";
import CounterFinder from "@/components/CounterFinder";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CountersPage({ searchParams }: { searchParams: { defender?: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  let data: Awaited<ReturnType<typeof loadCounterData>> | null = null;
  let dbError: string | null = null;
  try {
    data = await loadCounterData(await getDb(), session.userId);
  } catch (err) {
    console.error("Counters page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="page-title">Counters</h1>
      <p className="page-lede">
        Search a defender to see the best champions to bring against it, ranked, with a note on why each one works.
        Counters you own are marked with your copy&apos;s stats.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        data && (
          <CounterFinder
            initialData={data}
            isOfficer={isOfficerRole(session.role)}
            initialDefenderId={searchParams.defender ?? null}
          />
        )
      )}
    </AppShell>
  );
}
