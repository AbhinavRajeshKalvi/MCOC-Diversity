import LoginForm from "@/components/LoginForm";

export default function LoginPage({
  searchParams
}: {
  searchParams: { passwordChanged?: string };
}) {
  const passwordChanged = searchParams.passwordChanged === "1";
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="brand-mark fx-logo-stamp h-14 w-14 text-2xl mb-4" aria-hidden>
            WR
          </div>
          <div
            className="fx-rise font-display text-5xl font-bold uppercase tracking-wider leading-none bg-gradient-to-r from-brass-bright via-brass to-crimson-bright bg-clip-text text-transparent"
            style={{ animationDelay: "380ms" }}
          >
            War Room
          </div>
          <p className="fx-rise text-xs uppercase tracking-[0.2em] text-parchment-faint mt-2" style={{ animationDelay: "480ms" }}>Alliance defender diversity planner</p>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {["bg-cosmic", "bg-tech", "bg-mutant", "bg-skill", "bg-science", "bg-mystic"].map((c, i) => (
              <span
                key={c}
                className={`fx-rise h-1 w-6 rounded-full ${c} opacity-80`}
                style={{ animationDelay: `${560 + i * 60}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="panel p-6 fx-rise" style={{ animationDelay: "700ms" }}>
          {passwordChanged && (
            <p className="text-sm text-teal-bright bg-ink-raised border border-ink-line rounded-sm p-3 mb-4">
              Password changed. Sign in with your new password.
            </p>
          )}
          <LoginForm />
        </div>
        <p className="fx-rise text-xs text-parchment-faint text-center mt-4" style={{ animationDelay: "820ms" }}>
          New here? Ask an officer for a username — your first password is{" "}
          <span className="stat text-parchment-dim">12345678</span>.
        </p>
      </div>
    </div>
  );
}
