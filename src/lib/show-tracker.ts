import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";
import type { BoardImage } from "./queries";

/**
 * The show's works after it's finalized: every work going on the wall, where it is on its way in
 * (nothing yet → artist booked a drop-off time → dropped off), and works that fell through.
 */
export type TrackStage = "waiting" | "booked" | "received" | "unavailable";

const IN_SHOW = ["Selected", "Requested"] as const;

export async function getShowTracker(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;
  const rows = await db
    .select({ sw: s.showWorks, work: s.works })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, [...IN_SHOW, "Unavailable"])))
    .orderBy(asc(s.works.title));
  const unavailableArtists = [...new Set(rows.filter((r) => r.sw.status === "Unavailable").map((r) => r.work.artistId).filter((x): x is string => !!x))];
  // Works an artist has sent in for this show that aren't decided yet: possible stand-ins for one that fell through.
  const candidates = unavailableArtists.length
    ? await db
        .select({ sw: s.showWorks, work: s.works })
        .from(s.showWorks)
        .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
        .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.status, ["Submitted", "In review", "Shortlist"]), inArray(s.works.artistId, unavailableArtists)))
        .orderBy(asc(s.works.title))
    : [];
  const artistIds = [...new Set([...rows, ...candidates].map((r) => r.work.artistId).filter((x): x is string => !!x))];
  const ids = artistIds.length ? artistIds : ["-"];
  const workIds = [...rows, ...candidates].map((r) => r.work.id);
  const [artists, signed, windows, apps, images, sandbox] = await Promise.all([
    db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email, phone: s.artists.phone }).from(s.artists).where(inArray(s.artists.id, ids)),
    db
      .select({ artistId: s.agreements.artistId })
      .from(s.agreements)
      .where(and(inArray(s.agreements.artistId, ids), isNotNull(s.agreements.signedAt), isNull(s.agreements.voidedAt))),
    db
      .select()
      .from(s.bookingWindows)
      .where(and(eq(s.bookingWindows.showId, showId), eq(s.bookingWindows.kind, "dropoff"))),
    db.select({ id: s.applications.id, artistId: s.applications.artistId, extraWorksLeft: s.applications.extraWorksLeft }).from(s.applications).where(and(eq(s.applications.showId, showId), inArray(s.applications.artistId, ids))),
    workIds.length
      ? db
          .select()
          .from(s.workImages)
          .where(and(inArray(s.workImages.workId, workIds), eq(s.workImages.position, 0)))
      : Promise.resolve([] as (typeof s.workImages.$inferSelect)[]),
    db.select({ workId: s.sandboxItems.workId }).from(s.sandboxItems).where(eq(s.sandboxItems.showId, showId)),
  ]);
  const bookings = windows.length
    ? await db
        .select()
        .from(s.bookings)
        .where(and(inArray(s.bookings.windowId, windows.map((w) => w.id)), isNull(s.bookings.cancelledAt)))
        .orderBy(asc(s.bookings.startsAt))
    : [];
  const artist = new Map(artists.map((a) => [a.id, a]));
  const signedSet = new Set(signed.map((x) => x.artistId));
  const bookingFor = new Map<string, string>();
  for (const b of bookings) if (!bookingFor.has(b.artistId)) bookingFor.set(b.artistId, b.startsAt.toISOString());
  const invite = new Map(apps.map((a) => [a.artistId, a.extraWorksLeft]));
  const inSandbox = new Set(sandbox.map((x) => x.workId));
  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const fulls = await signedImageUrls(images.map((i) => i.storagePath ?? i.thumbPath));
  const imageByWork = new Map<string, BoardImage>(images.map((img, i) => [img.workId, { id: img.id, thumb: thumbs[i], full: fulls[i], w: img.widthPx, h: img.heightPx }]));

  const shape = (r: (typeof rows)[number]) => {
    const a = r.work.artistId ? artist.get(r.work.artistId) : undefined;
    const booking = (r.work.artistId && bookingFor.get(r.work.artistId)) || null;
    const stage: TrackStage = r.sw.status === "Unavailable" ? "unavailable" : r.sw.receivedAt ? "received" : booking ? "booked" : "waiting";
    return {
      id: r.work.id,
      title: r.work.title,
      year: r.work.year,
      medium: r.work.medium,
      category: r.work.category,
      width: r.work.width,
      height: r.work.height,
      depth: r.work.depth,
      unit: r.work.unit,
      sizeAsEntered: r.work.sizeAsEntered,
      price: r.work.priceUsd === null ? null : Number(r.work.priceUsd),
      framed: r.work.framed,
      image: imageByWork.get(r.work.id) ?? null,
      status: r.sw.status,
      stage,
      receivedAt: r.sw.receivedAt?.toISOString() ?? null,
      receivedBy: r.sw.receivedBy,
      damageNote: r.sw.damageNote,
      damageNotedAt: r.sw.damageNotedAt?.toISOString() ?? null,
      damageNotedBy: r.sw.damageNotedBy,
      inSandbox: inSandbox.has(r.work.id),
      artistId: r.work.artistId,
      artist: a?.name ?? "Unknown artist",
      email: a?.email?.trim() ?? null,
      phone: a?.phone ?? null,
      agreementSigned: !!r.work.artistId && signedSet.has(r.work.artistId),
      booking,
    };
  };

  return {
    show: { id: show.id, name: show.name, released: show.decisionsReleased },
    hasDropoffWindow: windows.length > 0,
    works: rows.map(shape).sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title)),
    replacements: unavailableArtists
      .map((artistId) => ({
        artistId,
        artist: artist.get(artistId)?.name ?? "Unknown artist",
        invitedLeft: invite.get(artistId) ?? 0,
        unavailable: rows.filter((r) => r.work.artistId === artistId && r.sw.status === "Unavailable").map((r) => r.work.title),
        candidates: candidates.filter((c) => c.work.artistId === artistId).map(shape),
      }))
      .sort((a, b) => a.artist.localeCompare(b.artist)),
  };
}

export type ShowTracker = NonNullable<Awaited<ReturnType<typeof getShowTracker>>>;
export type TrackedWork = ShowTracker["works"][number];
