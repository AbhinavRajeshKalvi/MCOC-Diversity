import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      footer={
        <Link href="/login" className="text-brass-bright hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
