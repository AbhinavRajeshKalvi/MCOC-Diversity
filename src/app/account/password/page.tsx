import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import PasswordForm from "@/components/PasswordForm";

export default async function PasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="page-title mb-6">
          Change password
        </h1>
        <div className="panel p-6">
          <PasswordForm forced={session.mustChangePassword} />
        </div>
      </div>
    </div>
  );
}
