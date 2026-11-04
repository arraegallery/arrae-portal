import { asc, desc, eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { EVENT_KINDS, DEADLINE_DOT, SHOW_DOT, WINDOW_DOT } from "@/app/admin/calendar/kinds";
import { getInbox, getRecentSubmissions } from "./queries";
import { addDays, galleryNow } from "./schedule";
import { calendarShifts } from "./schedule-data";
import { kindLabelOf, personColor, shiftTime } from "./schedule-kinds";

/** The cards Anai can put on the dashboard. */
export const MODULES = [
  { id: "messages", label: "Messages", href: "/admin/inbox" },
  { id: "team", label: "Team calendar", href: "/admin/schedule" },
  { id: "gallery", label: "Gallery calendar", href: "/admin/calendar" },
  { id: "activity", label: "Recent portal activity", href: "" },
  { id: "submissions", label: "New submissions", href: "/admin/new" },
  { id: "dates", label: "Shows & deadlines", href: "/admin/shows" },
] as const;
export type ModuleId = (typeof MODULES)[number]["id"];
export const DEFAULT_LAYOUT: (ModuleId | null)[] = ["messages", "team", "gallery", "activity", null, null];

/** One entry on a dashboard calendar: a day (or a run of days) with a colored dot. */
export type DashItem = { date: string; end?: string; title: string; sub?: string; dot: string; href?: string };

const layoutKey = (email: string) => `dashboard:${email.toLowerCase()}`;

export async function getLayout(email: string): Promise<(ModuleId | null)[]> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, layoutKey(email)));
  if (!row) return DEFAULT_LAYOUT;
  try {
    const ids = new Set<string>(MODULES.map((m) => m.id));
    const v = JSON.parse(row.value) as unknown[];
    const clean = v.map((x) => (typeof x === "string" && ids.has(x) ? (x as ModuleId) : null));
    return clean.length >= 3 ? clean : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function saveLayoutFor(email: string, layout: (string | null)[]) {
  const ids = new Set<string>(MODULES.map((m) => m.id));
  let clean = layout.slice(0, 15).map((x) => (x && ids.has(x) ? x : null));
  while (clean.length % 3) clean.push(null);
  if (clean.length < 3) clean = [null, null, null];
  const value = JSON.stringify(clean);
  await db.insert(s.appSettings).values({ key: layoutKey(email), value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
}

export async function getDashboardData(email: string) {
  const today = galleryNow().date;
  const from = addDays(today, -45);
  const to = addDays(today, 120);

  const inbox = (await getInbox())
    .sort((a, b) => b.unread - a.unread || b.last.at.localeCompare(a.last.at))
    .slice(0, 12)
    .map((c) => ({ ...c, href: `/admin/artists/${encodeURIComponent(c.artistId)}#messages` }));

  const team: DashItem[] = (await calendarShifts(from, to)).map((sh) => ({
    date: sh.date,
    title: sh.assistantName ?? "Open shift",
    sub: `${shiftTime(sh)}${sh.kind !== "standard" ? ` · ${sh.title || kindLabelOf(sh.kind)}` : sh.title ? ` · ${sh.title}` : ""}${sh.swapOpen ? " · swap requested" : ""}`,
    dot: sh.assistantEmail ? personColor(sh.color).dot : "bg-white ring-1 ring-ink/60",
    href: "/admin/schedule",
  }));

  const kindDot = (k: string) => EVENT_KINDS.find((x) => x.id === k)?.dot ?? "bg-slate-400";
  const events = await db.select().from(s.galleryEvents).orderBy(asc(s.galleryEvents.startsOn));
  const shows = await db.select().from(s.shows).where(ne(s.shows.type, "ARRAE Finds"));
  const windows = await db
    .select({ kind: s.bookingWindows.kind, startsOn: s.bookingWindows.startsOn, endsOn: s.bookingWindows.endsOn, show: s.shows.name })
    .from(s.bookingWindows)
    .innerJoin(s.shows, eq(s.shows.id, s.bookingWindows.showId));
  const time = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  };
  const showDates: DashItem[] = shows.flatMap((x) => [
    ...(x.opensOn ? [{ date: x.opensOn, title: `${x.name} opens`, dot: SHOW_DOT, href: "/admin/calendar" }] : []),
    ...(x.closesOn ? [{ date: x.closesOn, title: `${x.name} closes`, dot: SHOW_DOT, href: "/admin/calendar" }] : []),
    ...(x.applicationDeadline ? [{ date: x.applicationDeadline, title: `${x.name} submissions due`, dot: DEADLINE_DOT, href: "/admin/shows" }] : []),
    ...(x.decisionsDueOn ? [{ date: x.decisionsDueOn, title: `${x.name} decisions due`, dot: DEADLINE_DOT, href: "/admin/shows" }] : []),
  ]);
  const gallery: DashItem[] = [
    ...events.map((e) => ({
      date: e.startsOn,
      end: e.endsOn && e.endsOn > e.startsOn ? e.endsOn : undefined,
      title: e.title,
      sub: [e.startTime ? `${time(e.startTime)}${e.endTime ? `–${time(e.endTime)}` : ""}` : "", e.location ?? ""].filter(Boolean).join(" · ") || undefined,
      dot: kindDot(e.kind),
      href: "/admin/calendar",
    })),
    ...showDates,
    ...windows.map((w) => ({ date: w.startsOn, end: w.endsOn > w.startsOn ? w.endsOn : undefined, title: `${w.show} ${w.kind}`, dot: WINDOW_DOT, href: "/admin/logistics" })),
  ].filter((i) => (i.end ?? i.date) >= from && i.date <= to);

  const actRows = await db
    .select({ a: s.activity, artist: s.artists.name })
    .from(s.activity)
    .leftJoin(s.artists, eq(s.artists.id, s.activity.artistId))
    .orderBy(desc(s.activity.createdAt))
    .limit(25);
  const activity = actRows.map(({ a, artist }) => ({
    id: a.id,
    body: a.body,
    artist,
    actor: a.actor,
    kind: a.kind,
    at: a.createdAt.toISOString(),
    href: a.artistId ? `/admin/artists/${encodeURIComponent(a.artistId)}` : null,
  }));

  const submissions = (await getRecentSubmissions(email)).slice(0, 15).map((x) => ({
    id: x.id,
    artist: x.artist,
    body: x.body,
    at: x.at,
    unseen: x.unseen,
    href: x.isApplication ? `/admin/new` : `/admin/new?tab=artworks`,
  }));

  const dates = [...showDates].filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  return { today, inbox, team, gallery, activity, submissions, dates };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
