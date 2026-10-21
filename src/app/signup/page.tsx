import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import SignupForm from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <AuthLayout
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-brass-bright hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
