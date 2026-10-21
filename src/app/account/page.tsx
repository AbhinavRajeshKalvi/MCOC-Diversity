import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb, ObjectId } from "@/lib/db";
import AppShell from "@/components/AppShell";
import AccountPanel from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.allianceId) redirect("/alliance");
  const user = await (await getDb()).collection("users").findOne({ _id: new ObjectId(session.userId) });
  if (!user) redirect("/login");

  return (
    <AppShell session={session}>
      <h1 className="page-title">Account</h1>
      <p className="page-lede">Your name, email and password.</p>
      <AccountPanel
        account={{
          username: user.username,
          displayName: user.displayName,
          email: user.email ?? null,
          hasPassword: Boolean(user.passwordHash)
        }}
      />
    </AppShell>
  );
}
