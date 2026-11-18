import Link from "next/link";
import { notFound } from "next/navigation";
import { getShows } from "@/lib/queries";
import { getShowOverview } from "@/lib/show-stage";
import { requireOwner } from "@/lib/team";
import { ShowSwitcher, StageTabs } from "./StageNav";

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : null);

/** One page per show: its name and dates, then the six steps as tabs. Each step is its own page below. */
export default async function ShowLayout({ children, params }: { children: React.ReactNode; params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show: id } = await params;
  const [o, shows] = await Promise.all([getShowOverview(id), getShows()]);
  if (!o) notFound();
  const { show, facts, current } = o;
  const dates = [
    show.applicationDeadline && `Submissions due ${fmt(show.applicationDeadline)}`,
    show.opensOn && `Opens ${fmt(show.opensOn)}`,
    show.closesOn && `Closes ${fmt(show.closesOn)}`,
  ].filter(Boolean);
  return (
    <div>
      <header className="mx-auto max-w-[1600px] px-4 pt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          <Link href="/admin/s" className="hover:text-ink hover:underline">
            Shows
          </Link>{" "}
          · {show.type}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">{show.name}</h1>
          <ShowSwitcher current={show.id} shows={shows.filter((x) => x.type !== "ARRAE Finds").map((x) => ({ id: x.id, name: x.name }))} />
          {show.openForSubmissions && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200">Open to submissions</span>}
          {show.decisionsReleased && <span className="rounded-full bg-white px-2.5 py-1 text-xs text-muted ring-1 ring-line">Decisions released</span>}
        </div>
        {dates.length > 0 && <p className="mt-1 text-sm text-muted">{dates.join(" · ")}</p>}
        <StageTabs showId={show.id} current={current} facts={facts} />
      </header>
      {children}
    </div>
  );
}
