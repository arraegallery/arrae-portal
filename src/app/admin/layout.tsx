import Link from "next/link";
import { requireTeam } from "@/lib/team";
import { getNewSubmissionCount, getShows, getUnreadCount } from "@/lib/queries";
import { SearchBox } from "@/components/SearchBox";
import { ShowsMenu } from "@/components/ShowsMenu";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, role } = await requireTeam();
  const owner = role === "owner";
  const shows = await getShows();
  const unread = await getUnreadCount();
  const fresh = owner ? await getNewSubmissionCount(email) : 0;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" aria-label="ARRAE home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {owner &&
              shows
                .filter((s) => s.type === "Volume")
                .slice(-2)
                .reverse()
                .map((s) => (
                  <NavLink key={s.id} href={`/admin/review/${s.id}`}>
                    {s.name}
                  </NavLink>
                ))}
            {owner && (
              <NavLink href="/admin/new">
                New
                {fresh > 0 && (
                  <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white" aria-label={`${fresh} new`}>
                    {fresh}
                  </span>
                )}
              </NavLink>
            )}
            {owner && <NavLink href="/admin/sandbox">Sandbox</NavLink>}
            <NavLink href="/admin/artists">Artists</NavLink>
            {owner && <NavLink href="/admin/waitlist">Waitlist</NavLink>}
            <NavLink href="/admin/inbox">
              Inbox{unread > 0 && <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
            </NavLink>
            <NavLink href="/admin/logistics">Logistics</NavLink>
            {owner && <NavLink href="/admin/messages">Email artists</NavLink>}
            {owner && <NavLink href="/admin/shows">Shows</NavLink>}
            {owner && <NavLink href="/admin/agreements">Agreements</NavLink>}
            {owner && <NavLink href="/admin/shopify">Shopify</NavLink>}
            {owner && <NavLink href="/admin/team">Team</NavLink>}
            {owner && <ShowsMenu shows={shows.map((s) => ({ id: s.id, name: s.name, type: s.type }))} />}
          </nav>
          <SearchBox />
          <span className="text-xs text-muted">
            {email}
            {!owner && " · team"}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-2 py-1 hover:bg-white">
      {children}
    </Link>
  );
}
