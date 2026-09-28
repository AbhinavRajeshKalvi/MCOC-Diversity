export default function DbErrorNotice({ message }: { message: string }) {
  return (
    <div className="panel p-6 max-w-lg">
      <h2 className="font-display text-xl tracking-wide text-crimson-bright mb-2">
        Can't reach the database
      </h2>
      <p className="text-sm text-parchment-dim mb-3">
        This page couldn't load because the app can't connect to MongoDB right now.
      </p>
      <pre className="text-xs text-parchment-faint bg-ink-raised border border-ink-line rounded-sm p-3 whitespace-pre-wrap break-words">
        {message}
      </pre>
      <p className="text-xs text-parchment-faint mt-3">
        Check your <code className="stat">MONGODB_URI</code> in <code className="stat">.env.local</code>,
        confirm MongoDB is reachable, then refresh.
      </p>
    </div>
  );
}
