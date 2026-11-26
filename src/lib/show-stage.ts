import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { GALLERY_TZ } from "./logistics";
import { currentStage, type ShowFacts } from "./stages";

export * from "./stages";

/** Today's date at the gallery, as YYYY-MM-DD. */
export function galleryToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: GALLERY_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const count = sql<number>`count(*)::int`;

/** One show with the few numbers each step's tab shows, and the step it is on now. */
export async function getShowOverview(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;
  const [[works], [selected], [sandbox], [applicants], [received], [sold], windows, [notified]] = await Promise.all([
    db.select({ n: count }).from(s.showWorks).where(eq(s.showWorks.showId, showId)),
    db.select({ n: count }).from(s.showWorks).where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Selected", "Requested"]))),
    db.select({ n: count }).from(s.sandboxItems).where(eq(s.sandboxItems.showId, showId)),
    db.select({ n: count }).from(s.applications).where(eq(s.applications.showId, showId)),
    db.select({ n: count }).from(s.showWorks).where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Selected", "Requested"]), isNotNull(s.showWorks.receivedAt))),
    db
      .select({ n: count })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Selected", "Requested"]), isNotNull(s.works.soldAt))),
    db.select({ kind: s.bookingWindows.kind }).from(s.bookingWindows).where(eq(s.bookingWindows.showId, showId)),
    db.select({ n: sql<number>`count(distinct ${s.activity.artistId})::int` }).from(s.activity).where(and(eq(s.activity.showId, showId), eq(s.activity.kind, "show-welcome"))),
  ]);
  const facts: ShowFacts = {
    works: works.n,
    selected: selected.n,
    sandbox: sandbox.n,
    applicants: applicants.n,
    received: received.n,
    sold: sold.n,
    notified: notified.n,
    hasDropoff: windows.some((w) => w.kind === "dropoff"),
    hasPickup: windows.some((w) => w.kind === "pickup"),
  };
  return { show, facts, current: currentStage(show, facts, galleryToday()) };
}


/** Every show (not ARRAE Finds) with its step, for the Shows list. A handful of grouped queries, not one set per show. */
export async function getAllShowOverviews() {
  const shows = await db.select().from(s.shows).where(sql`${s.shows.type} <> 'ARRAE Finds'`);
  const byShow = <T extends { showId: string | null; n: number }>(rows: T[]) => new Map(rows.map((r) => [r.showId, r.n]));
  const inShow = inArray(s.showWorks.status, ["Selected", "Requested"]);
  const [works, selected, sandbox, applicants, received, notified] = await Promise.all([
    db.select({ showId: s.showWorks.showId, n: count }).from(s.showWorks).groupBy(s.showWorks.showId),
    db.select({ showId: s.showWorks.showId, n: count }).from(s.showWorks).where(inShow).groupBy(s.showWorks.showId),
    db.select({ showId: s.sandboxItems.showId, n: count }).from(s.sandboxItems).groupBy(s.sandboxItems.showId),
    db.select({ showId: s.applications.showId, n: count }).from(s.applications).groupBy(s.applications.showId),
    db.select({ showId: s.showWorks.showId, n: count }).from(s.showWorks).where(and(inShow, isNotNull(s.showWorks.receivedAt))).groupBy(s.showWorks.showId),
    db
      .select({ showId: s.activity.showId, n: sql<number>`count(distinct ${s.activity.artistId})::int` })
      .from(s.activity)
      .where(eq(s.activity.kind, "show-welcome"))
      .groupBy(s.activity.showId),
  ]);
  const m = { works: byShow(works), selected: byShow(selected), sandbox: byShow(sandbox), applicants: byShow(applicants), received: byShow(received), notified: byShow(notified) };
  const today = galleryToday();
  return shows.map((show) => {
    const facts: ShowFacts = {
      works: m.works.get(show.id) ?? 0,
      selected: m.selected.get(show.id) ?? 0,
      sandbox: m.sandbox.get(show.id) ?? 0,
      applicants: m.applicants.get(show.id) ?? 0,
      received: m.received.get(show.id) ?? 0,
      notified: m.notified.get(show.id) ?? 0,
      sold: 0,
      hasDropoff: false,
      hasPickup: false,
    };
    return { show, facts, current: currentStage(show, facts, today), past: !!show.closesOn && today > show.closesOn };
  });
}
