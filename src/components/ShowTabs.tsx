import Link from "next/link";

/** The two areas of a show: deciding on what was submitted, and freely playing with ideas. */
export function ShowTabs({ showId, active, sandboxCount }: { showId: string; active: "review" | "sandbox"; sandboxCount?: number }) {
  const tab = (key: "review" | "sandbox", href: string, label: React.ReactNode) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm transition ${active === key ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mt-4 flex gap-6 border-b border-line">
      {tab("review", `/admin/review/${showId}`, "Review board")}
      {tab(
        "sandbox",
        `/admin/sandbox/${showId}`,
        <>
          Sandbox{sandboxCount ? <span className="ml-1.5 rounded-full bg-ink/10 px-1.5 text-xs">{sandboxCount}</span> : null}
        </>,
      )}
    </nav>
  );
}
