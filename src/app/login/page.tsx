import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import AuthLayout from "@/components/AuthLayout";

export default function LoginPage({
  searchParams
}: {
  searchParams: { passwordChanged?: string; deleted?: string };
}) {
  const passwordChanged = searchParams.passwordChanged === "1";
  return (
    <AuthLayout
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-brass-bright hover:underline">
            Create an account
          </Link>
          , then create your alliance or join one with the code your Leader sends you.
        </>
      }
    >
      {passwordChanged && (
        <p className="text-sm text-teal-bright bg-ink-raised border border-ink-line rounded-sm p-3 mb-4">
          Password changed. Sign in with your new password.
        </p>
      )}
      {searchParams.deleted === "1" && (
        <p className="text-sm text-teal-bright bg-ink-raised border border-ink-line rounded-sm p-3 mb-4">
          Your account was deleted.
        </p>
      )}
      <LoginForm />
    </AuthLayout>
  );
}
