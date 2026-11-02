import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { readOnboarding } from "./onboarding";

/** Drop-off and pick-up booking. All times are gallery time (Miami). */
export const GALLERY_TZ = "America/New_York";
export type BookingKind = "dropoff" | "pickup";
export const KIND_LABEL: Record<BookingKind, string> = { dropoff: "Drop-off", pickup: "Pick-up" };

/** Works that need to come in (drop-off) or go home (pick-up) for a show. */
const NEEDS_HANDLING = ["Selected", "Requested"] as const;

type Window = typeof s.bookingWindows.$inferSelect;
type Booking = typeof s.bookings.$inferSelect;

/** Minutes the gallery's clock is ahead of UTC at that instant (negative in Miami). */
function tzOffsetMinutes(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: GALLERY_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((wall - at.getTime()) / 60000);
}

/** A wall-clock date and time in the gallery's time zone, as a real instant. */
export function galleryTime(date: string, hhmm: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMinutes(new Date(guess)) * 60000;
  t = guess - tzOffsetMinutes(new Date(t)) * 60000; // settle across DST changes
  return new Date(t);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

function eachDay(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let i = 0; d <= end && i < 120; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export type Slot = { start: string; end: string; left: number };
export type Day = { date: string; slots: Slot[] };

/** Every bookable slot in a window, with how many places are left. Past slots are left out. */
export function windowSlots(w: Window, active: Booking[], now = new Date()): Day[] {
  const days = new Set(w.weekdays.split(",").map(Number));
  const taken = new Map<number, number>();
  for (const b of active) taken.set(b.startsAt.getTime(), (taken.get(b.startsAt.getTime()) ?? 0) + 1);
  const out: Day[] = [];
  for (const date of eachDay(w.startsOn, w.endsOn)) {
    if (!days.has(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    const slots: Slot[] = [];
    for (let m = toMinutes(w.dayStart); m + w.slotMinutes <= toMinutes(w.dayEnd); m += w.slotMinutes) {
      const start = galleryTime(date, fromMinutes(m));
      if (start.getTime() < now.getTime() + 60 * 60000) continue; // at least an hour's notice
      const end = new Date(start.getTime() + w.slotMinutes * 60000);
      slots.push({ start: start.toISOString(), end: end.toISOString(), left: Math.max(0, w.capacity - (taken.get(start.getTime()) ?? 0)) });
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

/** Artists who have works to bring in (or take home) for a show, with those works. */
export async function worksToHandle(showId: string, kind: BookingKind) {
  const rows = await db
    .select({ sw: s.showWorks, work: s.works })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, [...NEEDS_HANDLING])));
  const byArtist = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.work.artistId) continue;
    if (kind === "pickup" && r.work.soldAt) continue; // sold works don't go home
    byArtist.set(r.work.artistId, [...(byArtist.get(r.work.artistId) ?? []), r]);
  }
  return byArtist;
}

export async function activeBookings(windowIds: number[]) {
  return windowIds.length
    ? db
        .select()
        .from(s.bookings)
        .where(and(inArray(s.bookings.windowId, windowIds), isNull(s.bookings.cancelledAt)))
        .orderBy(asc(s.bookings.startsAt))
    : [];
}

/** Ticks a per-show onboarding step on the artist's record. */
export async function setShowStep(artistId: string, showId: string, key: string, done: boolean) {
  const [a] = await db.select({ onboarding: s.artists.onboarding }).from(s.artists).where(eq(s.artists.id, artistId));
  if (!a) return;
  const ob = readOnboarding(a.onboarding);
  const shows = { ...(ob.shows ?? {}) };
  if (!!shows[showId]?.[key] === done) return;
  shows[showId] = { ...(shows[showId] ?? {}), [key]: done };
  await db
    .update(s.artists)
    .set({ onboarding: { ...ob, shows } })
    .where(eq(s.artists.id, artistId));
}

export function formatSlot(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  return new Date(iso).toLocaleString("en-US", { timeZone: GALLERY_TZ, ...opts });
}

export function windowSummary(w: Pick<Window, "startsOn" | "endsOn" | "dayStart" | "dayEnd" | "slotMinutes">) {
  const d = (x: string) => new Date(`${x}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  const t = (x: string) => {
    const [h, m] = x.split(":").map(Number);
    return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  };
  return `${d(w.startsOn)}${w.endsOn !== w.startsOn ? `–${d(w.endsOn)}` : ""}, ${t(w.dayStart)}–${t(w.dayEnd)}, ${w.slotMinutes} min slots`;
}

/** Everything the Logistics page shows: each window, its schedule, and who still needs to book. */
export async function getLogistics() {
  const windows = await db.select().from(s.bookingWindows).orderBy(asc(s.bookingWindows.startsOn));
  const shows = await db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows);
  const showName = new Map(shows.map((x) => [x.id, x.name]));
  const bookings = await activeBookings(windows.map((w) => w.id));
  const artistRows = await db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email, phone: s.artists.phone }).from(s.artists);
  const artist = new Map(artistRows.map((a) => [a.id, a]));
  const out = [];
  for (const w of windows) {
    const handle = await worksToHandle(w.showId, w.kind as BookingKind);
    const mine = bookings.filter((b) => b.windowId === w.id);
    const works = (artistId: string) =>
      (handle.get(artistId) ?? []).map((r) => ({
        id: r.work.id,
        title: r.work.title,
        status: r.sw.status,
        receivedAt: r.sw.receivedAt?.toISOString() ?? null,
        pickedUpAt: r.sw.pickedUpAt?.toISOString() ?? null,
      }));
    out.push({
      id: w.id,
      showId: w.showId,
      show: showName.get(w.showId) ?? w.showId,
      kind: w.kind as BookingKind,
      startsOn: w.startsOn,
      endsOn: w.endsOn,
      dayStart: w.dayStart,
      dayEnd: w.dayEnd,
      weekdays: w.weekdays,
      slotMinutes: w.slotMinutes,
      capacity: w.capacity,
      location: w.location,
      note: w.note,
      open: w.open,
      summary: windowSummary(w),
      slots: windowSlots(w, mine),
      bookings: mine.map((b) => ({ id: b.id, artistId: b.artistId, artist: artist.get(b.artistId) ?? null, start: b.startsAt.toISOString(), end: b.endsAt.toISOString(), note: b.note, bookedBy: b.bookedBy, works: works(b.artistId) })),
      unbooked: [...handle.keys()].filter((id) => !mine.some((b) => b.artistId === id)).map((id) => ({ artistId: id, artist: artist.get(id) ?? null, works: works(id) })),
    });
  }
  return { windows: out, shows: shows.map((x) => ({ id: x.id, name: x.name })) };
}

/** The windows an artist can book, with their current booking if they have one. */
export async function getStudioBookings(artistIds: string[]) {
  const windows = await db.select().from(s.bookingWindows).where(eq(s.bookingWindows.open, true)).orderBy(asc(s.bookingWindows.startsOn));
  if (!windows.length) return [];
  const shows = await db.select({ id: s.shows.id, name: s.shows.name, released: s.shows.decisionsReleased }).from(s.shows);
  const showName = new Map(shows.map((x) => [x.id, x.name]));
  const apps = await db.select({ showId: s.applications.showId, notified: s.applications.artistNotifiedAt }).from(s.applications).where(inArray(s.applications.artistId, artistIds));
  // Being asked to drop off would give away a decision, so wait until the artist has been told.
  const told = (showId: string) => !!shows.find((x) => x.id === showId)?.released || apps.some((a) => a.showId === showId && !!a.notified);
  const bookings = await activeBookings(windows.map((w) => w.id));
  const out = [];
  for (const w of windows) {
    if (!told(w.showId)) continue;
    const handle = await worksToHandle(w.showId, w.kind as BookingKind);
    const myWorks = artistIds.flatMap((id) => handle.get(id) ?? []);
    if (!myWorks.length) continue;
    const mine = bookings.find((b) => b.windowId === w.id && artistIds.includes(b.artistId));
    out.push({
      id: w.id,
      show: showName.get(w.showId) ?? w.showId,
      kind: w.kind as BookingKind,
      summary: windowSummary(w),
      location: w.location,
      note: w.note,
      works: myWorks.map((r) => r.work.title),
      booking: mine ? { id: mine.id, start: mine.startsAt.toISOString(), end: mine.endsAt.toISOString() } : null,
      days: windowSlots(
        w,
        bookings.filter((b) => b.windowId === w.id),
      ),
    });
  }
  return out;
}

/**
 * Books (or moves) an artist's slot in a window. One active booking per artist per window:
 * booking again replaces the old time. Checks the slot is real and still has room.
 */
export async function bookSlot(opts: { windowId: number; artistId: string; start: string; by: string; note?: string | null; allowClosed?: boolean }) {
  const [w] = await db.select().from(s.bookingWindows).where(eq(s.bookingWindows.id, opts.windowId));
  if (!w) throw new Error("That booking calendar no longer exists");
  if (!w.open && !opts.allowClosed) throw new Error("Booking for this is closed. Send us a message and we'll find a time.");
  const all = await activeBookings([w.id]);
  const others = all.filter((b) => b.artistId !== opts.artistId);
  const slot = windowSlots(w, others)
    .flatMap((d) => d.slots)
    .find((x) => x.start === new Date(opts.start).toISOString());
  if (!slot) throw new Error("That time isn't available. Please pick another.");
  if (slot.left < 1) throw new Error("Someone just took that time. Please pick another.");
  const now = new Date();
  await db
    .update(s.bookings)
    .set({ cancelledAt: now })
    .where(and(eq(s.bookings.windowId, w.id), eq(s.bookings.artistId, opts.artistId), isNull(s.bookings.cancelledAt)));
  const [row] = await db
    .insert(s.bookings)
    .values({ windowId: w.id, artistId: opts.artistId, startsAt: new Date(slot.start), endsAt: new Date(slot.end), note: opts.note?.trim().slice(0, 1000) || null, bookedBy: opts.by })
    .returning();
  if (w.kind === "dropoff") await setShowStep(opts.artistId, w.showId, "dropoffScheduled", true);
  return { booking: row, window: w, moved: all.length !== others.length };
}

export async function cancelBookingRow(id: number) {
  const [b] = await db.update(s.bookings).set({ cancelledAt: new Date() }).where(and(eq(s.bookings.id, id), isNull(s.bookings.cancelledAt))).returning();
  if (!b) return null;
  const [w] = await db.select().from(s.bookingWindows).where(eq(s.bookingWindows.id, b.windowId));
  if (w?.kind === "dropoff") await setShowStep(b.artistId, w.showId, "dropoffScheduled", false);
  return { booking: b, window: w };
}
