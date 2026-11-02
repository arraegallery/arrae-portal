import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getShows, getUnreadCount } from "@/lib/queries";
import { ShowsMenu } from "@/components/ShowsMenu";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  const shows = await getShows();
  const unread = await getUnreadCount();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" aria-label="ARRAE home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
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
            <Link href="/admin/sandbox" className="rounded-md px-2 py-1 hover:bg-white">
              Sandbox
            </Link>
            <Link href="/admin/artists" className="rounded-md px-2 py-1 hover:bg-white">
              Artists
            </Link>
            <Link href="/admin/waitlist" className="rounded-md px-2 py-1 hover:bg-white">
              Waitlist
            </Link>
            <Link href="/admin/inbox" className="rounded-md px-2 py-1 hover:bg-white">
              Inbox{unread > 0 && <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
            </Link>
            <Link href="/admin/messages" className="rounded-md px-2 py-1 hover:bg-white">
              Email artists
            </Link>
            <Link href="/admin/shows" className="rounded-md px-2 py-1 hover:bg-white">
              Shows
            </Link>
<ShowsMenu shows={shows.map((s) => ({ id: s.id, name: s.name, type: s.type }))} />
          </nav>
          <span className="ml-auto text-xs text-muted">{email}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
