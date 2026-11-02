"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { logActivity } from "@/lib/applications";
import { bookSlot, cancelBookingRow, formatSlot, KIND_LABEL, setShowStep, worksToHandle, type BookingKind } from "@/lib/logistics";
import { notifyEmail, notifyNewMessage, portalUrl } from "@/lib/notify";
import { requireOwner, requireTeam } from "@/lib/team";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type WindowInput = {
  showId: string;
  kind: BookingKind;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  weekdays: number[];
  slotMinutes: number;
  capacity: number;
  location: string;
  note: string;
};

function cleanWindow(w: WindowInput) {
  if (w.kind !== "dropoff" && w.kind !== "pickup") throw new Error("Choose drop-off or pick-up");
  if (!DATE.test(w.startsOn) || !DATE.test(w.endsOn)) throw new Error("Choose the first and last day");
  if (w.endsOn < w.startsOn) throw new Error("The last day is before the first day");
  if (!HHMM.test(w.dayStart) || !HHMM.test(w.dayEnd) || w.dayEnd <= w.dayStart) throw new Error("Choose a start and end time, with the end after the start");
  const days = [...new Set(w.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!days.length) throw new Error("Pick at least one day of the week");
  const slotMinutes = Math.round(Number(w.slotMinutes));
  if (!(slotMinutes >= 10 && slotMinutes <= 240)) throw new Error("Slots should be 10 to 240 minutes");
  const capacity = Math.round(Number(w.capacity));
  if (!(capacity >= 1 && capacity <= 20)) throw new Error("People per slot should be 1 to 20");
  return {
    showId: w.showId,
    kind: w.kind,
    startsOn: w.startsOn,
    endsOn: w.endsOn,
    dayStart: w.dayStart,
    dayEnd: w.dayEnd,
    weekdays: days.join(","),
    slotMinutes,
    capacity,
    location: w.location.trim().slice(0, 300) || null,
    note: w.note.trim().slice(0, 2000) || null,
  };
}

const refresh = () => {
  revalidatePath("/admin/logistics");
  revalidatePath("/studio");
};

export async function createBookingWindow(input: WindowInput) {
  const actor = (await requireTeam()).email;
  const values = cleanWindow(input);
  const [show] = await db.select({ id: s.shows.id }).from(s.shows).where(eq(s.shows.id, values.showId));
  if (!show) throw new Error("Choose a show");
  await db.insert(s.bookingWindows).values({ ...values, createdBy: actor });
  refresh();
}

export async function updateBookingWindow(id: number, input: WindowInput) {
  await requireTeam();
  await db.update(s.bookingWindows).set(cleanWindow(input)).where(eq(s.bookingWindows.id, id));
  refresh();
}

export async function setBookingWindowOpen(id: number, open: boolean) {
  await requireTeam();
  await db.update(s.bookingWindows).set({ open }).where(eq(s.bookingWindows.id, id));
  refresh();
}

export async function deleteBookingWindow(id: number) {
  await requireOwner();
  await db.delete(s.bookingWindows).where(eq(s.bookingWindows.id, id));
  refresh();
}

async function confirmToArtist(artistId: string, kind: BookingKind, show: string, start: string, location: string | null, moved: boolean) {
  const [a] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!a?.email) return;
  const when = formatSlot(start, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  await notifyEmail([a.email], {
    subject: `Your ${KIND_LABEL[kind].toLowerCase()} time for ${show}`,
    heading: `${KIND_LABEL[kind]} ${moved ? "moved to" : "booked for"} ${when}`,
    body: `Hi ${a.name.split(/\s+/)[0]},\n\nYour ${KIND_LABEL[kind].toLowerCase()} for ${show} is ${when}${location ? ` at ${location}` : ""}.\n\nIf you need another time, you can change it from your studio.`,
    buttonLabel: "Open my studio",
    buttonUrl: portalUrl("/studio"),
  });
}

/** ARRAE booking a time on an artist's behalf (they get a confirmation email). */
export async function bookForArtist(windowId: number, artistId: string, start: string) {
  const actor = (await requireTeam()).email;
  const r = await bookSlot({ windowId, artistId, start, by: actor, allowClosed: true });
  const [show] = await db.select({ name: s.shows.name }).from(s.shows).where(eq(s.shows.id, r.window.showId));
  await logActivity({ artistId, showId: r.window.showId, kind: "logistics", body: `${KIND_LABEL[r.window.kind as BookingKind]} booked for ${formatSlot(r.booking.startsAt.toISOString())}`, actor });
  await confirmToArtist(artistId, r.window.kind as BookingKind, show?.name ?? "", r.booking.startsAt.toISOString(), r.window.location, r.moved);
  refresh();
}

export async function cancelBooking(id: number) {
  const actor = (await requireTeam()).email;
  const r = await cancelBookingRow(id);
  if (r?.window) await logActivity({ artistId: r.booking.artistId, showId: r.window.showId, kind: "logistics", body: `${KIND_LABEL[r.window.kind as BookingKind]} on ${formatSlot(r.booking.startsAt.toISOString())} cancelled by ARRAE`, actor });
  refresh();
}

/** Mark works as physically in the gallery (or back with the artist). */
export async function markWorks(showId: string, workIds: string[], what: "received" | "pickedUp", done: boolean) {
  const actor = (await requireTeam()).email;
  if (!workIds.length) return;
  const now = done ? new Date() : null;
  const set = what === "received" ? { receivedAt: now, receivedBy: done ? actor : null } : { pickedUpAt: now, pickedUpBy: done ? actor : null };
  await db
    .update(s.showWorks)
    .set(set)
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.workId, workIds)));
  if (what === "received") await db.update(s.works).set({ receivedAt: now }).where(inArray(s.works.id, workIds));
  const works = await db.select({ id: s.works.id, title: s.works.title, artistId: s.works.artistId }).from(s.works).where(inArray(s.works.id, workIds));
  const artistIds = [...new Set(works.map((w) => w.artistId).filter((x): x is string => !!x))];
  if (what === "received") {
    const handle = await worksToHandle(showId, "dropoff");
    for (const artistId of artistIds) {
      const all = handle.get(artistId) ?? [];
      await setShowStep(artistId, showId, "worksReceived", all.length > 0 && all.every((r) => !!r.sw.receivedAt));
    }
  }
  for (const w of works)
    await logActivity({ artistId: w.artistId, workId: w.id, showId, kind: "logistics", body: `"${w.title}" ${what === "received" ? (done ? "received at the gallery" : "marked not received") : done ? "picked up by the artist" : "marked not picked up"}`, actor });
  refresh();
  for (const id of artistIds) revalidatePath(`/admin/artists/${id}`);
}

/** A nudge in the artist's message thread (and by email) to pick a time. */
export async function remindToBook(windowId: number, artistId: string) {
  const actor = (await requireTeam()).email;
  const [w] = await db.select().from(s.bookingWindows).where(eq(s.bookingWindows.id, windowId));
  const [a] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!w || !a) throw new Error("Not found");
  const [show] = await db.select({ name: s.shows.name }).from(s.shows).where(eq(s.shows.id, w.showId));
  const body = `Hi ${a.name.split(/\s+/)[0]}, please pick a ${KIND_LABEL[w.kind as BookingKind].toLowerCase()} time for ${show?.name ?? "the show"}. You'll find the calendar at the top of your studio: ${portalUrl("/studio")}`;
  await db.insert(s.artistMessages).values({ artistId, sender: "arrae", body, actor, readByArraeAt: new Date() });
  if (a.email) await notifyNewMessage({ to: a.email, artistName: a.name, preview: body });
  revalidatePath(`/admin/artists/${artistId}`);
}

/** The private link Google Calendar subscribes to. Making a new one stops the old link working. */
export async function resetCalendarLink() {
  await requireOwner();
  const token = crypto.randomUUID().replace(/-/g, "");
  await db.insert(s.appSettings).values({ key: "calendar_token", value: token }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: token } });
  revalidatePath("/admin/logistics");
}
