import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getShows } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  const shows = await getShows();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-display text-xl tracking-wide">
            ARRAE
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {shows
              .filter((s) => s.type === "Volume")
              .slice(-2)
              .reverse()
              .map((s) => (
                <Link key={s.id} href={`/admin/review/${s.id}`} className="rounded-md px-2 py-1 hover:bg-white">
                  {s.name}
                </Link>
              ))}
            <Link href="/admin/waitlist" className="rounded-md px-2 py-1 hover:bg-white">
              Waitlist
            </Link>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md px-2 py-1 hover:bg-white">All shows ▾</summary>
              <div className="absolute left-0 mt-1 w-80 rounded-md border border-line bg-white p-1 shadow-lg">
                {shows.map((s) => (
                  <Link key={s.id} href={`/admin/review/${s.id}`} className="block rounded px-2 py-1.5 hover:bg-paper">
                    {s.name} <span className="text-xs text-muted">· {s.type}</span>
                  </Link>
                ))}
              </div>
            </details>
          </nav>
          <span className="ml-auto text-xs text-muted">{email}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
