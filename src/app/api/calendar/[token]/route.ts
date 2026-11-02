import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { KIND_LABEL, worksToHandle, type BookingKind } from "@/lib/logistics";
import { portalUrl } from "@/lib/notify";

export const dynamic = "force-dynamic";

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** iCalendar lines must be folded at 75 octets. */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
};

/** A private calendar of every drop-off and pick-up booking, for Google Calendar to subscribe to. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [setting] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "calendar_token"));
  if (!setting || token.replace(/\.ics$/, "") !== setting.value) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const bookings = await db
    .select()
    .from(s.bookings)
    .where(and(isNull(s.bookings.cancelledAt), gt(s.bookings.startsAt, since)));
  const windowIds = [...new Set(bookings.map((b) => b.windowId))];
  const windows = windowIds.length ? await db.select().from(s.bookingWindows).where(inArray(s.bookingWindows.id, windowIds)) : [];
  const artistIds = [...new Set(bookings.map((b) => b.artistId))];
  const artists = artistIds.length ? await db.select().from(s.artists).where(inArray(s.artists.id, artistIds)) : [];
  const shows = await db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows);
  const handled = new Map<string, Awaited<ReturnType<typeof worksToHandle>>>();
  for (const w of windows) {
    const key = `${w.showId}|${w.kind}`;
    if (!handled.has(key)) handled.set(key, await worksToHandle(w.showId, w.kind as BookingKind));
  }

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARRAE Gallery//Portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:ARRAE drop-offs & pick-ups", "X-PUBLISHED-TTL:PT1H"];
  for (const b of bookings) {
    const w = windows.find((x) => x.id === b.windowId);
    const a = artists.find((x) => x.id === b.artistId);
    if (!w || !a) continue;
    const show = shows.find((x) => x.id === w.showId)?.name ?? w.showId;
    const works = (handled.get(`${w.showId}|${w.kind}`)?.get(a.id) ?? []).map((r) => `• ${r.work.title}`);
    const desc = [`${KIND_LABEL[w.kind as BookingKind]} for ${show}`, a.email, a.phone, works.length ? `\nWorks:\n${works.join("\n")}` : "", b.note ? `\nNote: ${b.note}` : "", `\n${portalUrl("/admin/logistics")}`]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:booking-${b.id}@arrae-portal`,
      `DTSTAMP:${stamp(b.createdAt)}`,
      `DTSTART:${stamp(b.startsAt)}`,
      `DTEND:${stamp(b.endsAt)}`,
      fold(`SUMMARY:${esc(`${KIND_LABEL[w.kind as BookingKind]}: ${a.name} (${show})`)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      ...(w.location ? [fold(`LOCATION:${esc(w.location)}`)] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="arrae.ics"' },
  });
}
