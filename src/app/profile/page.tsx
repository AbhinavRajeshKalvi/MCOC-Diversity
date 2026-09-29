import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb, ObjectId } from "@/lib/db";
import AppShell from "@/components/AppShell";
import RosterManager from "@/components/RosterManager";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadProfileData(userId: string) {
  const db = await getDb();

  const rosterRows = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId: new ObjectId(userId) } },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" }
    ])
    .toArray();

  const roster = rosterRows.map((r) => ({
    id: r._id.toString(),
    championId: r.championId.toString(),
    championName: r.champion.name as string,
    championImageUrl: (r.champion.imageUrl as string | null) ?? null,
    stars: (r.stars as number | null) ?? null,
    rank: (r.rank as number | null) ?? null,
    sigLevel: (r.sigLevel as number | null) ?? null,
    rating: (r.rating as number | null) ?? null,
    awakened: (r.awakened as boolean | null) ?? null,
    ascended: (r.ascended as boolean | null) ?? null,
    source: (r.source as string | undefined) ?? "manual"
  }));

  const championDocs = await db.collection("champions").find().sort({ name: 1 }).toArray();
  const champions = championDocs.map((c) => ({
    id: c._id.toString(),
    name: c.name as string,
    imageUrl: (c.imageUrl as string | null) ?? null
  }));

  return { roster, champions };
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let data: Awaited<ReturnType<typeof loadProfileData>> | null = null;
  let dbError: string | null = null;
  try {
    data = await loadProfileData(session.userId);
  } catch (err) {
    console.error("Profile page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  return (
    <AppShell session={session}>
      <h1 className="font-display text-3xl tracking-wide text-parchment mb-1">My roster</h1>
      <p className="text-sm text-parchment-faint mb-6">
        Import your roster from MCOC screenshots, or add champions manually with their stars, PI, and whether they are awakened or ascended. Rank and
        signature level are optional.
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        data && <RosterManager initialRoster={data.roster} champions={data.champions} />
      )}
    </AppShell>
  );
}
