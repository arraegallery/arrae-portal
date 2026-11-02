import Link from "next/link";
import { requireTeam } from "@/lib/team";
import { getNewSubmissionCount, getShows, getUnreadCount } from "@/lib/queries";
import { SearchBox } from "@/components/SearchBox";
import { NavMenu, NavTop } from "@/components/NavMenu";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, role } = await requireTeam();
  const owner = role === "owner";
  const shows = await getShows();
  const unread = await getUnreadCount();
  const fresh = owner ? await getNewSubmissionCount(email) : 0;
  const volumes = shows.filter((s) => s.type === "Volume").slice(-2).reverse();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" aria-label="ARRAE home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {owner ? (
              <>
                <NavMenu
                  label="Shows"
                  items={[
                    ...volumes.map((s) => ({ href: `/admin/review/${s.id}`, label: `${s.name} review` })),
                    { href: "/admin/sandbox", label: "Sandbox", hint: "plan a show" },
                    ...shows.filter((s) => !volumes.includes(s)).map((s, i) => ({ href: `/admin/review/${s.id}`, label: s.name, hint: s.type, divider: i === 0 })),
                    { href: "/admin/shows", label: "Show settings & applications", divider: true },
                  ]}
                />
                <NavTop href="/admin/new" badge={fresh} tone="red">
                  New
                </NavTop>
                <NavMenu
                  label="Artists"
                  items={[
                    { href: "/admin/artists", label: "All artists" },
                    { href: "/admin/waitlist", label: "Waitlist" },
                    { href: "/admin/agreements", label: "Agreements" },
                    { href: "/admin/documents", label: "Documents" },
                  ]}
                />
                <NavMenu
                  label="Messages"
                  badge={unread}
                  items={[
                    { href: "/admin/inbox", label: "Inbox", badge: unread },
                    { href: "/admin/messages", label: "Email artists" },
                  ]}
                />
                <NavMenu
                  label="Gallery"
                  items={[
                    { href: "/admin/calendar", label: "Calendar", hint: "shows & events" },
                    { href: "/admin/logistics", label: "Logistics", hint: "drop-off & pick-up" },
                    { href: "/admin/shopify", label: "Shopify" },
                    { href: "/admin/team", label: "Team", divider: true },
                  ]}
                />
              </>
            ) : (
              <>
                <NavTop href="/admin/artists">Artists</NavTop>
                <NavTop href="/admin/inbox" badge={unread}>
                  Inbox
                </NavTop>
                <NavTop href="/admin/logistics">Logistics</NavTop>
              </>
            )}
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
