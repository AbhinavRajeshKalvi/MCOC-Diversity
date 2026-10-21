import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb, ObjectId } from "@/lib/db";
import PasswordForm from "@/components/PasswordForm";

export default async function PasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await (await getDb())
    .collection("users")
    .findOne({ _id: new ObjectId(session.userId) }, { projection: { passwordHash: 1 } });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="page-title mb-6">
          Change password
        </h1>
        <div className="panel p-6">
          <PasswordForm forced={session.mustChangePassword} hasPassword={Boolean(user?.passwordHash)} />
        </div>
      </div>
    </div>
  );
}
