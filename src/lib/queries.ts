import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";
import type { ApplicationStatus, WorkStatus } from "./status";

export type BoardImage = { id: string; thumb: string | null; full: string | null; w: number | null; h: number | null };
export type BoardWork = {
  id: string;
  title: string;
  year: string | null;
  medium: string | null;
  category: string | null;
  description: string | null;
  price: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  unit: string;
  sizeAsEntered: string | null;
  sizeConfidence: string | null;
  status: WorkStatus;
  note: string | null;
  submittedOn: string | null;
  inShopify: boolean;
  images: BoardImage[];
};
export type BoardNote = { id: number; body: string; actor: string | null; createdAt: string; kind: string };
export type BoardEntry = {
  artist: {
    id: string;
    name: string;
    email: string;
    website: string | null;
    social: string | null;
    education: string | null;
    bio: string | null;
    internalNotes: string | null;
    shopifyCollectionHandle: string | null;
  };
  application: { id: string; status: ApplicationStatus; submittedOn: string | null; flag: string | null } | null;
  group: "New applicant" | "Roster artist";
  onWaitlist: boolean;
  works: BoardWork[];
  notes: BoardNote[];
};

export async function getShows() {
  return db.select().from(s.shows).orderBy(asc(s.shows.type), asc(s.shows.name));
}

export async function getBoard(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;

  const rows = await db
    .select({ sw: s.showWorks, work: s.works })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .where(eq(s.showWorks.showId, showId));

  const apps = await db.select().from(s.applications).where(eq(s.applications.showId, showId));
  const artistIds = [...new Set([...rows.map((r) => r.work.artistId), ...apps.map((a) => a.artistId)].filter((x): x is string => !!x))];
  if (!artistIds.length) return { show, entries: [] as BoardEntry[] };

  const [artists, images, notes, waiting] = await Promise.all([
    db.select().from(s.artists).where(inArray(s.artists.id, artistIds)),
    db
      .select()
      .from(s.workImages)
      .where(inArray(s.workImages.workId, rows.map((r) => r.work.id).length ? rows.map((r) => r.work.id) : ["-"]))
      .orderBy(asc(s.workImages.position)),
    db.select().from(s.activity).where(inArray(s.activity.artistId, artistIds)).orderBy(desc(s.activity.createdAt)),
    db.select({ id: s.waitlist.artistId }).from(s.waitlist).where(inArray(s.waitlist.artistId, artistIds)),
  ]);

  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const fulls = await signedImageUrls(images.map((i) => i.storagePath));
  const imagesByWork = new Map<string, BoardImage[]>();
  images.forEach((img, i) => {
    const list = imagesByWork.get(img.workId) ?? [];
    list.push({ id: img.id, thumb: thumbs[i], full: fulls[i], w: img.widthPx, h: img.heightPx });
    imagesByWork.set(img.workId, list);
  });

  const waitingSet = new Set(waiting.map((w) => w.id));
  // Newest application per artist for this show
  const appByArtist = new Map<string, (typeof apps)[number]>();
  for (const a of apps.sort((x, y) => String(x.submittedOn).localeCompare(String(y.submittedOn)))) appByArtist.set(a.artistId, a);

  const entries: BoardEntry[] = artists.map((a) => {
    const app = appByArtist.get(a.id) ?? null;
    return {
      artist: {
        id: a.id,
        name: a.name,
        email: a.email,
        website: a.website,
        social: a.social,
        education: a.education,
        bio: a.bio,
        internalNotes: a.internalNotes,
        shopifyCollectionHandle: a.shopifyCollectionHandle,
      },
      application: app ? { id: app.id, status: app.status, submittedOn: app.submittedOn, flag: app.flag } : null,
      group: app ? "New applicant" : "Roster artist",
      onWaitlist: waitingSet.has(a.id),
      works: rows
        .filter((r) => r.work.artistId === a.id)
        .map(({ sw, work: w }) => ({
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
          sizeConfidence: w.sizeConfidence,
          status: sw.status,
          note: sw.note,
          submittedOn: w.submittedOn,
          inShopify: !!w.shopifyHandle,
          images: imagesByWork.get(w.id) ?? [],
        })),
      notes: notes
        .filter((n) => n.artistId === a.id)
        .map((n) => ({ id: n.id, body: n.body, actor: n.actor, kind: n.kind, createdAt: n.createdAt.toISOString() })),
    };
  });

  entries.sort((x, y) => x.group.localeCompare(y.group) || x.artist.name.localeCompare(y.artist.name));
  return { show, entries };
}

export async function getWaitlist() {
  const rows = await db
    .select({ w: s.waitlist, a: s.artists, show: s.shows })
    .from(s.waitlist)
    .innerJoin(s.artists, eq(s.artists.id, s.waitlist.artistId))
    .leftJoin(s.shows, eq(s.shows.id, s.waitlist.fromShowId))
    .orderBy(asc(s.waitlist.rank));
  const ids = rows.map((r) => r.a.id);
  if (!ids.length) return [];
  const works = await db
    .select({ work: s.works, img: s.workImages })
    .from(s.works)
    .leftJoin(s.workImages, and(eq(s.workImages.workId, s.works.id), eq(s.workImages.position, 0)))
    .where(inArray(s.works.artistId, ids))
    .orderBy(desc(s.works.submittedOn));
  const thumbs = await signedImageUrls(works.map((r) => r.img?.thumbPath ?? r.img?.storagePath ?? null));
  return rows.map((r) => ({
    artistId: r.a.id,
    name: r.a.name,
    email: r.a.email,
    rank: r.w.rank,
    since: r.w.since,
    fromShow: r.show?.name ?? null,
    note: r.w.note,
    worksWanted: r.w.worksWanted,
    carryForward: r.w.carryForward,
    volumesWaited: r.w.volumesWaited,
    works: works
      .map((x, i) => ({ x, thumb: thumbs[i] }))
      .filter(({ x }) => x.work.artistId === r.a.id)
      .slice(0, 6)
      .map(({ x, thumb }) => ({
        id: x.work.id,
        title: x.work.title,
        medium: x.work.medium,
        price: x.work.priceUsd === null ? null : Number(x.work.priceUsd),
        width: x.work.width,
        height: x.work.height,
        unit: x.work.unit,
        thumb,
        w: x.img?.widthPx ?? null,
        h: x.img?.heightPx ?? null,
      })),
  }));
}
