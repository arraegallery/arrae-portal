import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
export type BoardNote = { id: number; body: string; actor: string | null; createdAt: string; kind: string; workId: string | null };
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
  // Roster = selected for any other show before (an accepted application or a selected work),
  // whether or not they sent an application this time.
  const [pastApps, pastWorks] = await Promise.all([
    db
      .select({ artistId: s.applications.artistId })
      .from(s.applications)
      .where(and(inArray(s.applications.artistId, artistIds), eq(s.applications.status, "Selected"), ne(s.applications.showId, showId))),
    db
      .select({ artistId: s.works.artistId })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(inArray(s.works.artistId, artistIds), eq(s.showWorks.status, "Selected"), ne(s.showWorks.showId, showId))),
  ]);
  const rosterSet = new Set([...pastApps, ...pastWorks].map((x) => x.artistId));
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
      group: rosterSet.has(a.id) ? "Roster artist" : "New applicant",
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
        .map((n) => ({ id: n.id, body: n.body, actor: n.actor, kind: n.kind, workId: n.workId, createdAt: n.createdAt.toISOString() })),
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

export type SandboxWork = {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string;
  year: string | null;
  medium: string | null;
  category: string | null;
  price: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  unit: string;
  sizeAsEntered: string | null;
  sold: boolean;
  image: BoardImage | null;
  /** This work's decision for the sandbox's show, if it is part of it */
  showStatus: WorkStatus | null;
  /** Other shows the work has been part of, for context */
  pastShows: string[];
  onWaitlist: boolean;
};

/** Everything the sandbox page needs: the sandbox itself, plus every work to pick from. */
export async function getSandbox(showId: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;
  const [works, artists, images, showWorks, shows, waiting, items] = await Promise.all([
    db
      .select({
        id: s.works.id,
        title: s.works.title,
        artistId: s.works.artistId,
        year: s.works.year,
        medium: s.works.medium,
        category: s.works.category,
        priceUsd: s.works.priceUsd,
        width: s.works.width,
        height: s.works.height,
        depth: s.works.depth,
        unit: s.works.unit,
        sizeAsEntered: s.works.sizeAsEntered,
        soldAt: s.works.soldAt,
        duplicateOf: s.works.duplicateOf,
      })
      .from(s.works),
    db.select({ id: s.artists.id, name: s.artists.name }).from(s.artists),
    db.select().from(s.workImages).where(eq(s.workImages.position, 0)),
    db.select().from(s.showWorks),
    db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows),
    db.select({ id: s.waitlist.artistId }).from(s.waitlist),
    db.select().from(s.sandboxItems).where(eq(s.sandboxItems.showId, showId)).orderBy(asc(s.sandboxItems.position), asc(s.sandboxItems.addedAt)),
  ]);
  const artistName = new Map(artists.map((a) => [a.id, a.name]));
  const showName = new Map(shows.map((x) => [x.id, x.name]));
  const waitingSet = new Set(waiting.map((w) => w.id));
  const imageByWork = new Map(images.map((i) => [i.workId, i]));
  const thumbs = await signedImageUrls(works.map((w) => imageByWork.get(w.id)?.thumbPath ?? imageByWork.get(w.id)?.storagePath ?? null));

  const indexOfWork = new Map(works.map((w, i) => [w.id, i]));
  const all: SandboxWork[] = works
    .filter((w) => !w.duplicateOf)
    .map((w) => {
      const i = indexOfWork.get(w.id)!;
      const img = imageByWork.get(w.id);
      const mine = showWorks.filter((x) => x.workId === w.id);
      return {
        id: w.id,
        title: w.title,
        artistId: w.artistId,
        artistName: (w.artistId && artistName.get(w.artistId)) || "Unknown artist",
        year: w.year,
        medium: w.medium,
        category: w.category,
        price: w.priceUsd === null ? null : Number(w.priceUsd),
        width: w.width,
        height: w.height,
        depth: w.depth,
        unit: w.unit,
        sizeAsEntered: w.sizeAsEntered,
        sold: !!w.soldAt,
        image: img ? { id: img.id, thumb: thumbs[i], full: null, w: img.widthPx, h: img.heightPx } : null,
        showStatus: mine.find((x) => x.showId === showId)?.status ?? null,
        pastShows: mine.filter((x) => x.showId !== showId).map((x) => showName.get(x.showId) ?? x.showId),
        onWaitlist: !!w.artistId && waitingSet.has(w.artistId),
      };
    })
    .sort((a, b) => a.artistName.localeCompare(b.artistName) || a.title.localeCompare(b.title));

  return { show, sandbox: items.map((x) => ({ workId: x.workId, note: x.note })), works: all };
}

export async function getSandboxWorkIds(showId: string) {
  const rows = await db.select({ id: s.sandboxItems.workId }).from(s.sandboxItems).where(eq(s.sandboxItems.showId, showId));
  return rows.map((r) => r.id);
}

export async function getArtistList() {
  return db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).orderBy(asc(s.artists.name));
}

/** Everything about one artist, for their profile page. */
export async function getArtistProfile(artistId: string) {
  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) return null;
  const [works, apps, shows, notes, waiting, changes] = await Promise.all([
    db.select().from(s.works).where(eq(s.works.artistId, artistId)).orderBy(desc(s.works.submittedOn)),
    db.select().from(s.applications).where(eq(s.applications.artistId, artistId)).orderBy(desc(s.applications.submittedOn)),
    db.select({ id: s.shows.id, name: s.shows.name, type: s.shows.type, opensOn: s.shows.opensOn, open: s.shows.openForSubmissions }).from(s.shows).orderBy(desc(s.shows.opensOn)),
    db.select().from(s.activity).where(eq(s.activity.artistId, artistId)).orderBy(desc(s.activity.createdAt)),
    db.select().from(s.waitlist).where(eq(s.waitlist.artistId, artistId)),
    db.select().from(s.workChanges).where(eq(s.workChanges.artistId, artistId)).orderBy(desc(s.workChanges.createdAt)),
  ]);
  const messages = await db.select().from(s.artistMessages).where(eq(s.artistMessages.artistId, artistId)).orderBy(asc(s.artistMessages.createdAt));
  const workIds = works.map((w) => w.id);
  const [images, showWorks] = workIds.length
    ? await Promise.all([
        db.select().from(s.workImages).where(and(inArray(s.workImages.workId, workIds), eq(s.workImages.position, 0))),
        db.select().from(s.showWorks).where(inArray(s.showWorks.workId, workIds)),
      ])
    : [[], []];
  const showName = new Map(shows.map((x) => [x.id, x.name]));
  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const imageByWork = new Map(images.map((img, i) => [img.workId, { id: img.id, thumb: thumbs[i], full: null, w: img.widthPx, h: img.heightPx } as BoardImage]));
  // Which shows this artist has been part of: selected works or a Selected application.
  const showHistory = shows
    .map((sh) => {
      const app = apps.find((a) => a.showId === sh.id);
      const inShow = showWorks.filter((x) => x.showId === sh.id);
      const selectedWorks = inShow.filter((x) => x.status === "Selected").length;
      return { showId: sh.id, name: sh.name, type: sh.type, opensOn: sh.opensOn, status: app?.status ?? null, works: inShow.length, selectedWorks, exhibited: selectedWorks > 0 || app?.status === "Selected" };
    })
    .filter((h) => h.status || h.works);
  return {
    artist,
    shows: shows.map((x) => ({ id: x.id, name: x.name, type: x.type, open: x.open })),
    showHistory,
    messages: messages.map((m) => ({ id: m.id, sender: m.sender as "arrae" | "artist", body: m.body, at: m.createdAt.toISOString(), read: !!m.readByArraeAt })),
    changes: changes.map((c) => ({ id: c.id, workId: c.workId, field: c.field, oldValue: c.oldValue, newValue: c.newValue, actor: c.actor, role: c.actorRole, at: c.createdAt.toISOString() })),
    onWaitlist: waiting.length > 0,
    applications: apps.map((a) => ({ id: a.id, show: a.showId ? (showName.get(a.showId) ?? a.showId) : "No show", showId: a.showId, status: a.status, submittedOn: a.submittedOn })),
    works: works.map((w) => ({
      id: w.id,
      title: w.title,
      year: w.year,
      category: w.category,
      medium: w.medium,
      description: w.description,
      price: w.priceUsd === null ? null : Number(w.priceUsd),
      width: w.width,
      height: w.height,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.sizeAsEntered,
      sold: !!w.soldAt,
      submittedOn: w.submittedOn,
      photosRequestedAt: w.photosRequestedAt?.toISOString() ?? null,
      image: imageByWork.get(w.id) ?? null,
      shows: showWorks.filter((x) => x.workId === w.id).map((x) => ({ showId: x.showId, name: showName.get(x.showId) ?? x.showId, status: x.status })),
    })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, kind: n.kind, workId: n.workId, createdAt: n.createdAt.toISOString() })),
  };
}

export async function getArtistDirectory() {
  const [artists, works, apps] = await Promise.all([
    db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email, arraeBio: s.artists.arraeBio, lastSeenAt: s.artists.lastSeenAt }).from(s.artists).orderBy(asc(s.artists.name)),
    db.select({ artistId: s.works.artistId }).from(s.works),
    db.select({ artistId: s.applications.artistId, status: s.applications.status }).from(s.applications),
  ]);
  const count = new Map<string, number>();
  for (const w of works) if (w.artistId) count.set(w.artistId, (count.get(w.artistId) ?? 0) + 1);
  const selected = new Set(apps.filter((a) => a.status === "Selected").map((a) => a.artistId));
  return artists.map(({ lastSeenAt, ...a }) => ({ ...a, lastSeen: lastSeenAt?.toISOString() ?? null, works: count.get(a.id) ?? 0, everSelected: selected.has(a.id), hasArraeBio: !!a.arraeBio }));
}

/** Everyone we could email, with what they've applied to, for the Messages page. */
export async function getMessageRecipients() {
  const [artists, apps, works, waiting, shows, history] = await Promise.all([
    db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).orderBy(asc(s.artists.name)),
    db.select({ artistId: s.applications.artistId, showId: s.applications.showId, status: s.applications.status }).from(s.applications),
    db
      .select({ artistId: s.works.artistId, showId: s.showWorks.showId, status: s.showWorks.status })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId)),
    db.select({ id: s.waitlist.artistId }).from(s.waitlist),
    db.select({ id: s.shows.id, name: s.shows.name, type: s.shows.type, opensOn: s.shows.opensOn }).from(s.shows).orderBy(desc(s.shows.opensOn), asc(s.shows.name)),
    db.select().from(s.activity).where(eq(s.activity.kind, "email-batch")).orderBy(desc(s.activity.createdAt)).limit(20),
  ]);
  const waitingSet = new Set(waiting.map((w) => w.id));
  // Per artist and show: did they apply, and were they (or any of their works) selected?
  const perArtist = new Map<string, Map<string, { applied: boolean; selected: boolean }>>();
  const mark = (artistId: string | null, showId: string | null, selected: boolean) => {
    if (!artistId || !showId) return;
    const m = perArtist.get(artistId) ?? new Map();
    const cur = m.get(showId) ?? { applied: false, selected: false };
    m.set(showId, { applied: true, selected: cur.selected || selected });
    perArtist.set(artistId, m);
  };
  for (const a of apps) mark(a.artistId, a.showId, a.status === "Selected");
  for (const w of works) mark(w.artistId, w.showId, w.status === "Selected");
  return {
    shows,
    history: history.map((h) => ({ id: h.id, body: h.body, actor: h.actor, at: h.createdAt.toISOString() })),
    artists: artists.map((a) => {
      const m = perArtist.get(a.id) ?? new Map();
      const entries = [...m.entries()];
      return {
        ...a,
        roster: entries.some(([, v]) => v.selected),
        onWaitlist: waitingSet.has(a.id),
        appliedTo: entries.map(([k]) => k),
        selectedFor: entries.filter(([, v]) => v.selected).map(([k]) => k),
      };
    }),
  };
}

/** Latest message per artist, newest conversation first, with unread counts for ARRAE. */
export async function getInbox() {
  const rows = await db.select().from(s.artistMessages).orderBy(desc(s.artistMessages.createdAt)).limit(2000);
  const artists = await db.select({ id: s.artists.id, name: s.artists.name }).from(s.artists);
  const nameOf = new Map(artists.map((a) => [a.id, a.name]));
  const byArtist = new Map<string, { artistId: string; name: string; last: { body: string; sender: string; at: string }; unread: number; total: number }>();
  for (const m of rows) {
    const cur = byArtist.get(m.artistId) ?? { artistId: m.artistId, name: nameOf.get(m.artistId) ?? m.artistId, last: { body: m.body, sender: m.sender, at: m.createdAt.toISOString() }, unread: 0, total: 0 };
    cur.total++;
    if (m.sender === "artist" && !m.readByArraeAt) cur.unread++;
    byArtist.set(m.artistId, cur);
  }
  return [...byArtist.values()];
}

export async function getUnreadCount() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.artistMessages)
    .where(and(eq(s.artistMessages.sender, "artist"), isNull(s.artistMessages.readByArraeAt)));
  return row?.n ?? 0;
}

/** Every show with its settings and how many artists and works it has. */
export async function getShowsAdmin() {
  const shows = await db.select().from(s.shows).orderBy(desc(s.shows.createdAt));
  const apps = await db.select({ showId: s.applications.showId, status: s.applications.status }).from(s.applications);
  const works = await db.select({ showId: s.showWorks.showId, status: s.showWorks.status }).from(s.showWorks);
  return shows.map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    opensOn: x.opensOn,
    closesOn: x.closesOn,
    applicationDeadline: x.applicationDeadline,
    decisionsDueOn: x.decisionsDueOn,
    description: x.description,
    openForSubmissions: x.openForSubmissions,
    decisionsReleased: x.decisionsReleased,
    artists: apps.filter((a) => a.showId === x.id).length,
    selectedArtists: apps.filter((a) => a.showId === x.id && a.status === "Selected").length,
    works: works.filter((w) => w.showId === x.id).length,
    selectedWorks: works.filter((w) => w.showId === x.id && w.status === "Selected").length,
  }));
}

// ---- New submissions (the red dot) ----

const seenKey = (email: string) => `submissions_seen:${email.toLowerCase()}`;
const isNewSubmission = and(eq(s.activity.kind, "submission"), sql`${s.activity.body} not like 'Artist withdrew%'`);

async function submissionsSeenAt(email: string) {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, seenKey(email)));
  // First visit: count the last 7 days so the dot starts meaningful, not with every past application.
  return row ? new Date(row.value) : new Date(Date.now() - 7 * 864e5);
}

/** Applications and works that came in since this team member last opened the New page. */
export async function getNewSubmissionCount(email: string) {
  const since = await submissionsSeenAt(email);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.activity)
    .where(and(isNewSubmission, sql`${s.activity.createdAt} > ${since.toISOString()}`));
  return row?.n ?? 0;
}

/** The latest submissions, newest first, each marked if it came in since the last visit. */
export async function getRecentSubmissions(email: string) {
  const since = await submissionsSeenAt(email);
  const rows = await db
    .select({ a: s.activity, artist: s.artists.name, show: s.shows.name })
    .from(s.activity)
    .leftJoin(s.artists, eq(s.artists.id, s.activity.artistId))
    .leftJoin(s.shows, eq(s.shows.id, s.activity.showId))
    .where(eq(s.activity.kind, "submission"))
    .orderBy(desc(s.activity.createdAt))
    .limit(150);
  return rows.map(({ a, artist, show }) => ({
    id: a.id,
    artistId: a.artistId,
    artist: artist ?? "Unknown artist",
    showId: a.showId,
    show,
    body: a.body,
    at: a.createdAt.toISOString(),
    unseen: a.createdAt > since && !a.body.startsWith("Artist withdrew"),
  }));
}

export async function markSubmissionsSeen(email: string) {
  const value = new Date().toISOString();
  await db.insert(s.appSettings).values({ key: seenKey(email), value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
}
