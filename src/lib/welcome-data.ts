import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "./notify";
import { readTemplates, type WelcomeArtist, type WelcomeDropoff, type WelcomeShow } from "./welcome";

export const WELCOME_KIND = "show-welcome";
export const templateKey = (showId: string) => `welcome_template:${showId}`;

const longDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "soon";

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** "Tuesday, November 24 or Wednesday, November 25, between 11am and 4pm" from a drop-off window. */
function dropoffWhen(w: typeof s.bookingWindows.$inferSelect) {
  const days = new Set(w.weekdays.split(",").map(Number));
  const dates: string[] = [];
  const d = new Date(`${w.startsOn}T12:00:00Z`);
  const end = new Date(`${w.endsOn}T12:00:00Z`);
  for (let i = 0; d <= end && i < 60; i++, d.setUTCDate(d.getUTCDate() + 1))
    if (days.has(d.getUTCDay())) dates.push(d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }));
  const list = dates.length <= 2 ? dates.join(" or ") : `${dates.slice(0, -1).join(", ")} or ${dates[dates.length - 1]}`;
  return `${list}, between ${clock(w.dayStart)} and ${clock(w.dayEnd)}`;
}

/** Everything the Notify artists page needs for one show. */
export async function getWelcomeData(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;
  const rows = await db
    .select({ workId: s.works.id, title: s.works.title, artistId: s.works.artistId })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Selected", "Requested"])))
    .orderBy(asc(s.works.title));
  const artistIds = [...new Set(rows.map((r) => r.artistId).filter((x): x is string => !!x))];
  const none = ["-"];
  const ids = artistIds.length ? artistIds : none;
  const [artists, pastApps, pastWorks, signed, sent, windows, setting] = await Promise.all([
    db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email, collection: s.artists.shopifyCollectionHandle }).from(s.artists).where(inArray(s.artists.id, ids)),
    db
      .select({ artistId: s.applications.artistId })
      .from(s.applications)
      .where(and(inArray(s.applications.artistId, ids), eq(s.applications.status, "Selected"), ne(s.applications.showId, showId))),
    db
      .select({ artistId: s.works.artistId })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(inArray(s.works.artistId, ids), eq(s.showWorks.status, "Selected"), ne(s.showWorks.showId, showId))),
    db
      .select({ artistId: s.agreements.artistId })
      .from(s.agreements)
      .where(and(inArray(s.agreements.artistId, ids), isNotNull(s.agreements.signedAt), isNull(s.agreements.voidedAt))),
    db
      .select({ artistId: s.activity.artistId, at: s.activity.createdAt })
      .from(s.activity)
      .where(and(eq(s.activity.showId, showId), eq(s.activity.kind, WELCOME_KIND), inArray(s.activity.artistId, ids)))
      .orderBy(desc(s.activity.createdAt)),
    db
      .select()
      .from(s.bookingWindows)
      .where(and(eq(s.bookingWindows.showId, showId), eq(s.bookingWindows.kind, "dropoff")))
      .orderBy(asc(s.bookingWindows.startsOn)),
    db.select().from(s.appSettings).where(eq(s.appSettings.key, templateKey(showId))),
  ]);
  // Returning = a collection on the ARRAE site, or selected for another show before (same rule as the sandbox).
  const returning = new Set([...artists.filter((a) => a.collection).map((a) => a.id), ...pastApps.map((x) => x.artistId), ...pastWorks.map((x) => x.artistId!)]);
  const signedSet = new Set(signed.map((x) => x.artistId));
  const sentAt = new Map<string, string>();
  for (const x of sent) if (x.artistId && !sentAt.has(x.artistId)) sentAt.set(x.artistId, x.at.toISOString());
  const list: WelcomeArtist[] = artists
    .map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email.trim(),
      group: returning.has(a.id) ? ("returning" as const) : ("new" as const),
      works: rows.filter((r) => r.artistId === a.id).map((r) => r.title),
      agreementSigned: signedSet.has(a.id),
      sentAt: sentAt.get(a.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const w = windows[0];
  const dropoff: WelcomeDropoff = w ? { when: dropoffWhen(w), location: w.location } : null;
  let raw: unknown = null;
  try {
    raw = setting[0] ? JSON.parse(setting[0].value) : null;
  } catch {
    raw = null;
  }
  const welcomeShow: WelcomeShow = { id: show.id, name: show.name, opens: longDate(show.opensOn), closes: longDate(show.closesOn) };
  return {
    show: welcomeShow,
    released: show.decisionsReleased,
    dropoff,
    dropoffOpen: !!w?.open,
    artists: list,
    templates: readTemplates(raw),
    studioUrl: portalUrl("/studio"),
  };
}
