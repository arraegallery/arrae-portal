import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAssistant } from "@/lib/schedule";
import { callName } from "@/lib/schedule-kinds";
import { teamRoleFor } from "@/lib/team";
import { supabaseForRequest } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function signOut() {
  "use server";
  const supabase = await supabaseForRequest();
  await supabase.auth.signOut();
  redirect("/login");
}

/** The Gallery Assistant area: only the schedule, never artist data. */
export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const { assistant, owner, email } = await requireAssistant();
  const team = owner || !!(await teamRoleFor(email));
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/schedule" aria-label="My schedule" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/schedule" className="rounded-md px-2 py-1 hover:bg-white">
              Schedule
            </Link>
            <Link href="/schedule/hours" className="rounded-md px-2 py-1 hover:bg-white">
              My hours
            </Link>
            <Link href="/schedule/account" className="rounded-md px-2 py-1 hover:bg-white">
              Account
            </Link>
            {team && owner && (
              <Link href="/admin/schedule" className="rounded-md px-2 py-1 text-muted hover:bg-white">
                Back to admin
              </Link>
            )}
            {team && !owner && (
              <>
                <Link href="/admin/artists" className="rounded-md px-2 py-1 hover:bg-white">
                  Artists
                </Link>
                <Link href="/admin/inbox" className="rounded-md px-2 py-1 hover:bg-white">
                  Messages
                </Link>
              </>
            )}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span className="hidden sm:inline">{assistant ? callName(assistant) : email}</span>
            <button className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-white">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
