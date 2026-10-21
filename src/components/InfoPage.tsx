// Plain public pages (privacy policy, account deletion) linked from the Play Store listing.
export default function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-10">
      <article className="mx-auto max-w-2xl panel p-6 sm:p-8 space-y-4 text-sm leading-relaxed text-parchment-dim [&_h2]:text-parchment [&_h2]:font-semibold [&_h2]:mt-6 [&_a]:text-brass-bright">
        <h1 className="page-title">{title}</h1>
        {children}
      </article>
    </div>
  );
}
