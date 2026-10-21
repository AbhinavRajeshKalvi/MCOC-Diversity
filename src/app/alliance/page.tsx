import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb, ObjectId } from "@/lib/db";
import { loadAllianceFor } from "@/lib/accounts";
import { listAllianceMembers } from "@/lib/members";
import { isOfficerRole } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AuthLayout from "@/components/AuthLayout";
import AllianceSetup from "@/components/AllianceSetup";
import AlliancePanel from "@/components/AlliancePanel";
import AllianceMemberList from "@/components/AllianceMemberList";

export const dynamic = "force-dynamic";

export default async function AlliancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/account/password");

  if (!session.allianceId) {
    return (
      <AuthLayout>
        <AllianceSetup displayName={session.displayName} />
      </AuthLayout>
    );
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
  const alliance = user ? await loadAllianceFor(db, user) : null;
  if (!alliance) redirect("/login");
  const members = await listAllianceMembers(db, user!.allianceId as ObjectId);

  return (
    <AppShell session={session}>
      <h1 className="page-title">Alliance</h1>
      <p className="page-lede">
        {isOfficerRole(session.role)
          ? "Your alliance's name, join code and members. Manage members on the Admin page."
          : "Your alliance and everyone in it. Ask an officer to change your battlegroup or role."}
      </p>
      <AlliancePanel alliance={alliance} role={session.role}>
        <AllianceMemberList members={members} viewerId={session.userId} />
      </AlliancePanel>
    </AppShell>
  );
}
