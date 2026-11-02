import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireTeam } from "@/lib/team";
import { portalUrl } from "@/lib/notify";
import { GalleryCalendar } from "./GalleryCalendar";

export const metadata = { title: "Calendar · ARRAE" };

export default async function CalendarPage() {
  const me = await requireTeam();
  const owner = me.role === "owner";
  const shows = await db
    .select({
      id: s.shows.id,
      name: s.shows.name,
      type: s.shows.type,
      opensOn: s.shows.opensOn,
      closesOn: s.shows.closesOn,
      applicationDeadline: s.shows.applicationDeadline,
      decisionsDueOn: s.shows.decisionsDueOn,
    })
    .from(s.shows)
    .orderBy(asc(s.shows.name));
  const windows = await db
    .select({ id: s.bookingWindows.id, kind: s.bookingWindows.kind, startsOn: s.bookingWindows.startsOn, endsOn: s.bookingWindows.endsOn, show: s.shows.name })
    .from(s.bookingWindows)
    .innerJoin(s.shows, eq(s.shows.id, s.bookingWindows.showId));
  const events = await db.select().from(s.galleryEvents).orderBy(asc(s.galleryEvents.startsOn));
  const [token] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "calendar_token"));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return (
    <GalleryCalendar
      today={today}
      owner={owner}
      feedUrl={owner && token ? portalUrl(`/api/calendar/${token.value}.ics`) : null}
      shows={shows}
      windows={windows}
      events={events.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        notes: e.notes,
        showId: e.showId,
      }))}
    />
  );
}
