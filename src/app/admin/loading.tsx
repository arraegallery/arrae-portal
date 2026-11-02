export default function Loading() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-10" aria-busy="true">
      <div className="h-3 w-40 animate-pulse rounded bg-line" />
      <div className="mt-3 h-9 w-72 animate-pulse rounded bg-line" />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-line/60" />
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">Loading…</p>
    </main>
  );
}
