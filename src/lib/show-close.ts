import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";
import { activeBookings } from "./logistics";

/** The show while it's up and when it closes: what sold, and what goes back to each artist. */
export async function getShowClosing(showId: string) {
  const [show] = await db.select({ id: s.shows.id, name: s.shows.name, closesOn: s.shows.closesOn }).from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;
  const rows = await db
    .select({ sw: s.showWorks, work: s.works, artist: s.artists.name })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Selected", "Requested"])))
    .orderBy(asc(s.artists.name), asc(s.works.title));
  const windows = await db.select().from(s.bookingWindows).where(and(eq(s.bookingWindows.showId, showId), eq(s.bookingWindows.kind, "pickup")));
  const booked = await activeBookings(windows.map((w) => w.id));
  const bookingOf = new Map(booked.map((b) => [b.artistId, b.startsAt.toISOString()]));
  const ids = rows.map((r) => r.work.id);
  const images = ids.length ? await db.select().from(s.workImages).where(and(inArray(s.workImages.workId, ids), eq(s.workImages.position, 0))) : [];
  const img = new Map(images.map((i) => [i.workId, i]));
  const thumbs = await signedImageUrls(rows.map((r) => img.get(r.work.id)?.thumbPath ?? img.get(r.work.id)?.storagePath ?? null));
  return {
    show,
    hasPickupWindow: windows.length > 0,
    works: rows.map((r, i) => ({
      id: r.work.id,
      title: r.work.title,
      artistId: r.work.artistId,
      artist: r.artist ?? "Unknown artist",
      price: r.work.priceUsd === null ? null : Number(r.work.priceUsd),
      thumb: thumbs[i],
      sold: !!r.work.soldAt,
      received: !!r.sw.receivedAt,
      pickedUp: !!r.sw.pickedUpAt,
      pickup: (r.work.artistId && bookingOf.get(r.work.artistId)) || null,
    })),
  };
}
export type ShowClosing = NonNullable<Awaited<ReturnType<typeof getShowClosing>>>;
