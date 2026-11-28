import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";
import { artistFacingApplication, artistFacingWork, type ApplicationStatus, type WorkStatus } from "./status";

/**
 * Everything an artist sees in their studio. Decisions only show once ARRAE has
 * released them for that show (or told this artist); until then it reads "Under review".
 */
export async function getStudio(artistIds: string[]) {
  const shows = await db.select().from(s.shows).orderBy(desc(s.shows.opensOn), asc(s.shows.name));
  const works = await db.select().from(s.works).where(inArray(s.works.artistId, artistIds)).orderBy(desc(s.works.submittedOn));
  const apps = await db.select().from(s.applications).where(inArray(s.applications.artistId, artistIds));
  const workIds = works.map((w) => w.id);
  const showWorks = workIds.length ? await db.select().from(s.showWorks).where(inArray(s.showWorks.workId, workIds)) : [];
  const images = workIds.length
    ? await db
        .select()
        .from(s.workImages)
        .where(and(inArray(s.workImages.workId, workIds), eq(s.workImages.position, 0)))
    : [];
  const people = await db.select({ collection: s.artists.shopifyCollectionHandle }).from(s.artists).where(inArray(s.artists.id, artistIds));
  const messages = await db.select().from(s.artistMessages).where(inArray(s.artistMessages.artistId, artistIds)).orderBy(asc(s.artistMessages.createdAt));

  const showById = new Map(shows.map((x) => [x.id, x]));
  const released = (showId: string) => {
    const show = showById.get(showId);
    const app = apps.find((a) => a.showId === showId);
    return !!show?.decisionsReleased || !!app?.artistNotifiedAt;
  };
  /** ARRAE invited them to add works to this show's application: how many they may still add. */
  const inviteFor = (showId: string) => {
    const app = apps.find((a) => a.showId === showId && a.extraWorksLeft > 0);
    return app ? { left: app.extraWorksLeft } : null;
  };
  const askedForMore = (showId: string) => apps.some((a) => a.showId === showId && a.status === "Request other works");
  const softWork = (status: WorkStatus, showId: string) => {
    if (released(showId)) return artistFacingWork(status, showById.get(showId)?.name);
    return status === "Submitted" ? "Received" : "Under review";
  };
  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const imageByWork = new Map(images.map((img, i) => [img.workId, { id: img.id, thumb: thumbs[i], full: null as string | null, w: img.widthPx, h: img.heightPx }]));

  // Roster artists (a collection on the ARRAE site, or selected for any show) can add new works any
  // time, even with no open call. ARRAE is told, and the work waits for a later show.
  const roster =
    people.some((p) => !!p.collection) || apps.some((a) => a.status === "Selected") || showWorks.some((x) => x.status === "Selected");

  return {
    roster,
    shows: shows.map((x) => ({ id: x.id, name: x.name, type: x.type, open: x.openForSubmissions, description: x.description, deadline: x.applicationDeadline, opensOn: x.opensOn })),
    // Open calls, plus any show where ARRAE asked this artist for more works (even once it has closed).
    openShows: shows
      .filter((x) => x.openForSubmissions || inviteFor(x.id))
      .map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
        description: x.description,
        deadline: x.applicationDeadline,
        opensOn: x.opensOn,
        invite: inviteFor(x.id),
      })),
    applications: apps
      .filter((a) => a.showId)
      .map((a) => ({
        showId: a.showId!,
        show: showById.get(a.showId!)?.name ?? a.showId!,
        label: released(a.showId!) ? artistFacingApplication(a.status as ApplicationStatus, showById.get(a.showId!)?.name) : "Under review",
      })),
    works: works.map((w) => ({
      id: w.id,
      title: w.title,
      year: w.year,
      medium: w.medium,
      category: w.category,
      description: w.description,
      price: w.priceUsd === null ? null : Number(w.priceUsd),
      width: w.width,
      height: w.height,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.sizeAsEntered,
      sold: !!w.soldAt,
      archived: !!w.archivedAt,
      photosRequested: !!w.photosRequestedAt,
      photosRequestNote: w.photosRequestNote,
      image: imageByWork.get(w.id) ?? null,
      shows: showWorks
        .filter((x) => x.workId === w.id)
        .map((x) => ({
          showId: x.showId,
          name: showById.get(x.showId)?.name ?? x.showId,
          label: softWork(x.status as WorkStatus, x.showId),
          // Artists can take a work back out only before ARRAE has looked at it.
          canWithdraw: x.status === "Submitted" && (!!showById.get(x.showId)?.openForSubmissions || askedForMore(x.showId)),
        })),
    })),
    messages: messages.map((m) => ({ id: m.id, sender: m.sender as "arrae" | "artist", body: m.body, at: m.createdAt.toISOString(), read: !!m.readByArtistAt })),
  };
}

export type Studio = Awaited<ReturnType<typeof getStudio>>;
