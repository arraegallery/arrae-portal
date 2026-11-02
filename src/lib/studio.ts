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
  const messages = await db.select().from(s.artistMessages).where(inArray(s.artistMessages.artistId, artistIds)).orderBy(asc(s.artistMessages.createdAt));

  const showById = new Map(shows.map((x) => [x.id, x]));
  const released = (showId: string) => {
    const show = showById.get(showId);
    const app = apps.find((a) => a.showId === showId);
    return !!show?.decisionsReleased || !!app?.artistNotifiedAt;
  };
  const softWork = (status: WorkStatus, showId: string) => {
    if (released(showId)) return artistFacingWork(status, showById.get(showId)?.name);
    return status === "Submitted" ? "Received" : "Under review";
  };
  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const imageByWork = new Map(images.map((img, i) => [img.workId, { id: img.id, thumb: thumbs[i], full: null, w: img.widthPx, h: img.heightPx }]));

  return {
    shows: shows.map((x) => ({ id: x.id, name: x.name, type: x.type, open: x.openForSubmissions, description: x.description, deadline: x.applicationDeadline, opensOn: x.opensOn })),
    openShows: shows
      .filter((x) => x.openForSubmissions)
      .map((x) => ({ id: x.id, name: x.name, type: x.type, description: x.description, deadline: x.applicationDeadline, opensOn: x.opensOn })),
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
      image: imageByWork.get(w.id) ?? null,
      shows: showWorks
        .filter((x) => x.workId === w.id)
        .map((x) => ({
          showId: x.showId,
          name: showById.get(x.showId)?.name ?? x.showId,
          label: softWork(x.status as WorkStatus, x.showId),
          // Artists can take a work back out only before ARRAE has looked at it.
          canWithdraw: x.status === "Submitted" && !!showById.get(x.showId)?.openForSubmissions,
        })),
    })),
    messages: messages.map((m) => ({ id: m.id, sender: m.sender as "arrae" | "artist", body: m.body, at: m.createdAt.toISOString(), read: !!m.readByArtistAt })),
  };
}

export type Studio = Awaited<ReturnType<typeof getStudio>>;
