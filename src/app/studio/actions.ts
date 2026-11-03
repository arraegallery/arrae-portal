"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireArtist } from "@/lib/artist-auth";
import { ensureApplication, logActivity } from "@/lib/applications";
import { recordWorkChanges } from "@/lib/changes";
import { attachPhotos, createPhotoSlots, listPhotos, makeMainPhoto, removePhoto, type UploadedPhoto } from "@/lib/photos";
import { arraeRecipients, notifyEmail, notifyNewMessage, portalUrl } from "@/lib/notify";
import { parseAmount } from "@/lib/amount";
import { asResult } from "@/lib/action-result";
import { bookSlot, cancelBookingRow, formatSlot, getStudioBookings, KIND_LABEL, worksToHandle, type BookingKind } from "@/lib/logistics";

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);
const clean = (v: unknown, max = 4000) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown, label: string) => {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return null;
  const n = parseAmount(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: "${t}" isn't a number we can read. Try something like 24, 24.5 or 24 1/2.`);
  return n;
};

async function myWorks(workIds: string[]) {
  const me = await requireArtist();
  const rows = workIds.length ? await db.select().from(s.works).where(inArray(s.works.id, workIds)) : [];
  if (rows.some((w) => !w.artistId || !me.artistIds.includes(w.artistId))) throw new Error("That isn't one of your works");
  return { me, rows };
}

async function openShow(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show || !show.openForSubmissions) throw new Error("That show isn't taking submissions right now");
  return show;
}

/** Offer past, still-available works for an open show. */
export async function putForwardWorks(workIds: string[], showId: string) {
  const { me, rows } = await myWorks(workIds);
  const show = await openShow(showId);
  const available = rows.filter((w) => !w.soldAt);
  if (!available.length) throw new Error("Choose at least one available work");
  await db.insert(s.showWorks).values(available.map((w) => ({ showId, workId: w.id, status: "Submitted" as const }))).onConflictDoNothing();
  await ensureApplication(me.artist.id, showId);
  for (const w of available) await logActivity({ artistId: w.artistId, workId: w.id, showId, kind: "submission", body: `Artist put "${w.title}" forward for ${show.name}`, actor: me.email });
  revalidatePath("/studio");
  revalidatePath(`/admin/review/${showId}`);
}

/** Take a work back out of a show, only while ARRAE hasn't reviewed it yet. */
export async function withdrawWork(workId: string, showId: string) {
  const { me, rows } = await myWorks([workId]);
  await openShow(showId);
  const deleted = await db
    .delete(s.showWorks)
    .where(and(eq(s.showWorks.workId, workId), eq(s.showWorks.showId, showId), eq(s.showWorks.status, "Submitted")))
    .returning();
  if (!deleted.length) throw new Error("This work is already being reviewed. Send us a message if you need to change it.");
  await logActivity({ artistId: rows[0].artistId, workId, showId, kind: "submission", body: `Artist withdrew "${rows[0].title}"`, actor: me.email });
  revalidatePath("/studio");
}

/** Signed upload slots for a new work's photos: a full image and a small one for grids, per photo. */
export async function prepareUploads(count: number) {
  await requireArtist();
  const workId = `wrk_${rand()}`;
  const slots = await createPhotoSlots(workId, count);
  return { workId, slots };
}

type NewWork = {
  workId: string;
  title: string;
  year?: string;
  medium?: string;
  height?: string;
  width?: string;
  depth?: string;
  unit?: string;
  price?: string;
  description?: string;
  images: { path: string; thumbPath: string | null; w: number | null; h: number | null }[];
  showId?: string | null;
};

/** Save a newly submitted work, its photos, and (optionally) put it forward for an open show. */
export async function submitNewWork(input: NewWork) {
  return asResult(() => saveNewWork(input));
}

async function saveNewWork(input: NewWork) {
  const me = await requireArtist();
  if (!/^wrk_[a-z0-9]{14}$/.test(input.workId)) throw new Error("Something went wrong with the upload. Please try again.");
  const title = clean(input.title, 300);
  if (!title) throw new Error("Give the work a title");
  if (!input.images.length) throw new Error("Add at least one photo");
  const prefix = `works/${input.workId}/`;
  if (input.images.some((i) => !i.path.startsWith(prefix) || (i.thumbPath && !i.thumbPath.startsWith(prefix)))) throw new Error("Those photos don't belong to this work");
  const [exists] = await db.select({ id: s.works.id }).from(s.works).where(eq(s.works.id, input.workId));
  if (exists) throw new Error("This work was already saved");
  const show = input.showId ? await openShow(input.showId) : null;
  const price = num(input.price, "Price");
  await db.insert(s.works).values({
    id: input.workId,
    artistId: me.artist.id,
    title,
    year: clean(input.year, 40),
    medium: clean(input.medium, 300),
    description: clean(input.description, 10000),
    priceUsd: price === null ? null : price.toFixed(2),
    height: num(input.height, "Height"),
    width: num(input.width, "Width"),
    depth: num(input.depth, "Depth"),
    unit: input.unit === "cm" ? "cm" : "in",
    sizeConfidence: "high",
    submittedOn: new Date().toISOString().slice(0, 10),
  });
  await db.insert(s.workImages).values(
    input.images.map((img, i) => ({ id: `img_${rand()}`, workId: input.workId, position: i, storagePath: img.path, thumbPath: img.thumbPath, widthPx: img.w, heightPx: img.h })),
  );
  if (show) {
    await db.insert(s.showWorks).values({ showId: show.id, workId: input.workId, status: "Submitted" }).onConflictDoNothing();
    await ensureApplication(me.artist.id, show.id);
  }
  await logActivity({ artistId: me.artist.id, workId: input.workId, showId: show?.id, kind: "submission", body: `Artist submitted a new work, "${title}"${show ? ` for ${show.name}` : ""}`, actor: me.email });
  revalidatePath("/studio");
  if (show) revalidatePath(`/admin/review/${show.id}`);
}

/** An artist updating their own work's details. Every change lands in the change log. */
type MyWorkFields = { title?: string; year?: string; medium?: string; price?: string; width?: string; height?: string; depth?: string; unit?: string; description?: string };
export async function updateMyWork(workId: string, fields: MyWorkFields) {
  return asResult(() => saveMyWork(workId, fields));
}

async function saveMyWork(workId: string, fields: MyWorkFields) {
  const { me, rows } = await myWorks([workId]);
  const before = rows[0];
  if (before.soldAt) throw new Error("This work has sold, so its details are locked. Send us a message if something needs fixing.");
  const set: Partial<typeof s.works.$inferInsert> = {};
  if (fields.title !== undefined) set.title = clean(fields.title, 300) ?? before.title;
  if (fields.year !== undefined) set.year = clean(fields.year, 40);
  if (fields.medium !== undefined) set.medium = clean(fields.medium, 300);
  if (fields.description !== undefined) set.description = clean(fields.description, 10000);
  if (fields.price !== undefined) {
    const p = num(fields.price, "Price");
    set.priceUsd = p === null ? null : p.toFixed(2);
  }
  for (const k of ["width", "height", "depth"] as const) if (fields[k] !== undefined) set[k] = num(fields[k], k[0].toUpperCase() + k.slice(1));
  if (fields.unit !== undefined) set.unit = fields.unit === "cm" ? "cm" : "in";
  if (!Object.keys(set).length) return;
  await db.update(s.works).set(set).where(eq(s.works.id, workId));
  const changed = await recordWorkChanges({ workId, artistId: before.artistId, before, after: set, actor: me.email, role: "artist" });
  if (changed.length)
    await logActivity({ artistId: before.artistId, workId, kind: "edit", body: `Artist edited "${set.title ?? before.title}": ${changed.join(", ").replace("priceUsd", "price")}`, actor: me.email });
  revalidatePath("/studio");
}

export async function sendStudioMessage(body: string) {
  const me = await requireArtist();
  const text = body.trim().slice(0, 5000);
  if (!text) throw new Error("Write a message first");
  const [row] = await db.insert(s.artistMessages).values({ artistId: me.artist.id, sender: "artist", body: text, actor: me.email, readByArtistAt: new Date() }).returning();
  await notifyNewMessage({ to: "arrae", artistName: me.artist.name, preview: text, artistId: me.artist.id });
  revalidatePath("/studio/messages");
  return { id: row.id, sender: "artist" as const, body: row.body, at: row.createdAt.toISOString(), read: true };
}

export async function markStudioMessagesRead() {
  const me = await requireArtist();
  await db
    .update(s.artistMessages)
    .set({ readByArtistAt: new Date() })
    .where(and(inArray(s.artistMessages.artistId, me.artistIds), eq(s.artistMessages.sender, "arrae"), isNull(s.artistMessages.readByArtistAt)));
}

/* Photos on an artist's own works. */

async function myEditableWork(workId: string) {
  const { me, rows } = await myWorks([workId]);
  if (rows[0].soldAt) throw new Error("This work has sold, so its photos are locked. Send us a message if something needs fixing.");
  return { me, work: rows[0] };
}

export async function getMyWorkPhotos(workId: string) {
  await myWorks([workId]);
  return listPhotos(workId);
}

export async function prepareMyPhotoUploads(workId: string, count: number) {
  await myEditableWork(workId);
  return createPhotoSlots(workId, count);
}

/** New photos from the artist. If ARRAE asked for better ones, this answers the request and lets ARRAE know. */
export async function addMyWorkPhotos(workId: string, images: UploadedPhoto[], asMain: boolean) {
  const { me, work } = await myEditableWork(workId);
  await attachPhotos(workId, images, asMain);
  await logActivity({ artistId: work.artistId, workId, kind: "edit", body: `Artist uploaded ${images.length} new photo${images.length === 1 ? "" : "s"} for "${work.title}"`, actor: me.email });
  if (work.photosRequestedAt) {
    await db.update(s.works).set({ photosRequestedAt: null, photosRequestNote: null }).where(eq(s.works.id, workId));
    const body = `I've uploaded new photos for "${work.title}".`;
    await db.insert(s.artistMessages).values({ artistId: me.artist.id, sender: "artist", body, actor: me.email, readByArtistAt: new Date() });
    await notifyNewMessage({ to: "arrae", artistName: me.artist.name, preview: body, artistId: me.artist.id });
  }
  revalidatePath("/studio");
  return listPhotos(workId);
}

export async function makeMyMainPhoto(workId: string, imageId: string) {
  await myEditableWork(workId);
  await makeMainPhoto(workId, imageId);
  revalidatePath("/studio");
  return listPhotos(workId);
}

export async function removeMyPhoto(workId: string, imageId: string) {
  await myEditableWork(workId);
  await removePhoto(workId, imageId, true);
  revalidatePath("/studio");
  return listPhotos(workId);
}

/* Drop-off and pick-up times. */

export async function bookMyTime(windowId: number, start: string, note?: string) {
  const me = await requireArtist();
  const mine = (await getStudioBookings(me.artistIds)).find((x) => x.id === windowId);
  if (!mine) throw new Error("There's nothing for you to book here");
  const [w] = await db.select().from(s.bookingWindows).where(eq(s.bookingWindows.id, windowId));
  const handle = await worksToHandle(w.showId, w.kind as BookingKind);
  const artistId = me.artistIds.find((id) => handle.has(id))!;
  const r = await bookSlot({ windowId, artistId, start, by: me.email, note });
  const when = formatSlot(r.booking.startsAt.toISOString());
  const [show] = await db.select({ name: s.shows.name }).from(s.shows).where(eq(s.shows.id, r.window.showId));
  const label = KIND_LABEL[r.window.kind as BookingKind];
  await logActivity({ artistId, showId: r.window.showId, kind: "logistics", body: `Artist ${r.moved ? "moved their" : "booked a"} ${label.toLowerCase()} ${r.moved ? "to" : "for"} ${when}`, actor: me.email });
  await notifyEmail(arraeRecipients(), {
    subject: `${me.artist.name}: ${label.toLowerCase()} ${r.moved ? "moved to" : "booked for"} ${when}`,
    heading: `${label} ${r.moved ? "moved" : "booked"}`,
    body: `${me.artist.name} ${r.moved ? "moved their" : "booked a"} ${label.toLowerCase()} for ${show?.name ?? "a show"}: ${when}.${r.booking.note ? `\n\nTheir note: ${r.booking.note}` : ""}`,
    buttonLabel: "Open logistics",
    buttonUrl: portalUrl("/admin/logistics"),
  });
  revalidatePath("/studio");
  revalidatePath("/admin/logistics");
  return { start: r.booking.startsAt.toISOString() };
}

export async function cancelMyBooking(bookingId: number) {
  const me = await requireArtist();
  const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
  if (!b || !me.artistIds.includes(b.artistId)) throw new Error("That isn't one of your bookings");
  const r = await cancelBookingRow(bookingId);
  if (r?.window) {
    const when = formatSlot(b.startsAt.toISOString());
    const label = KIND_LABEL[r.window.kind as BookingKind];
    await logActivity({ artistId: b.artistId, showId: r.window.showId, kind: "logistics", body: `Artist cancelled their ${label.toLowerCase()} on ${when}`, actor: me.email });
    await notifyEmail(arraeRecipients(), {
      subject: `${me.artist.name} cancelled their ${label.toLowerCase()} (${when})`,
      body: `${me.artist.name} cancelled their ${label.toLowerCase()} on ${when}. They haven't picked a new time yet.`,
      buttonLabel: "Open logistics",
      buttonUrl: portalUrl("/admin/logistics"),
    });
  }
  revalidatePath("/studio");
  revalidatePath("/admin/logistics");
}
