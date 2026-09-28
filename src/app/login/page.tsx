import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl tracking-wide text-brass-bright">War Room</div>
          <p className="text-sm text-parchment-faint mt-1">Alliance defender diversity planner</p>
        </div>
        <div className="panel p-6">
          <LoginForm />
        </div>
        <p className="text-xs text-parchment-faint text-center mt-4">
          New here? Ask an officer for a username — your first password is{" "}
          <span className="stat text-parchment-dim">12345678</span>.
        </p>
      </div>
    </div>
  );
}
