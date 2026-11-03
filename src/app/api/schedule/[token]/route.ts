import { and, eq, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "@/lib/notify";
import { addDays, galleryNow, kindLabel } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
const local = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;

// Miami time, so calendar apps place shifts correctly across daylight saving.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** One Gallery Assistant's own shifts, as a private calendar their phone can subscribe to. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32}$/.test(token)) return new Response("Not found", { status: 404 });
  const [me] = await db.select().from(s.assistants).where(eq(s.assistants.calendarToken, token));
  if (!me || me.removedAt) return new Response("Not found", { status: 404 });
  const shifts = await db
    .select()
    .from(s.shifts)
    .where(and(eq(s.shifts.assistantEmail, me.email), gte(s.shifts.date, addDays(galleryNow().date, -60))));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ARRAE Gallery//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ARRAE shifts",
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const sh of shifts) {
    const what = sh.kind === "standard" ? "ARRAE gallery shift" : `ARRAE: ${sh.title || kindLabel(sh.kind)}`;
    const tbd = sh.timeTbd ? `Hours TBD${sh.maxHours ? `, not more than ${sh.maxHours} hours` : ""}.` : null;
    const coord = sh.coordinateWith ? `Coordinate with ${sh.coordinateWith} to set the hours.` : null;
    const nextDay = addDays(sh.date, 1).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${sh.id}@arrae-portal`,
      `DTSTAMP:${stamp(new Date())}`,
      // A shift whose hours aren't set yet is an all-day entry until they are.
      ...(sh.timeTbd
        ? [`DTSTART;VALUE=DATE:${sh.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay}`]
        : [`DTSTART;TZID=America/New_York:${local(sh.date, sh.startTime)}`, `DTEND;TZID=America/New_York:${local(sh.date, sh.endTime)}`]),
      fold(`SUMMARY:${esc(sh.timeTbd ? `${what} (hours TBD)` : what)}`),
      fold(`DESCRIPTION:${esc([tbd, coord, sh.notes, `Your schedule: ${portalUrl("/schedule")}`].filter(Boolean).join("\n\n"))}`),
      "LOCATION:ARRAE Gallery",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="arrae-shifts.ics"' },
  });
}
