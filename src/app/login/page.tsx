import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="brand-mark h-14 w-14 text-2xl mb-4" aria-hidden>
            WR
          </div>
          <div className="font-display text-5xl font-bold uppercase tracking-wider leading-none bg-gradient-to-r from-brass-bright via-brass to-crimson-bright bg-clip-text text-transparent">
            War Room
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-parchment-faint mt-2">Alliance defender diversity planner</p>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {["bg-cosmic", "bg-tech", "bg-mutant", "bg-skill", "bg-science", "bg-mystic"].map((c) => (
              <span key={c} className={`h-1 w-6 rounded-full ${c} opacity-80`} />
            ))}
          </div>
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
