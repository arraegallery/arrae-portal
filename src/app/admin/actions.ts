"use server";

import { and, asc, eq, gt, lt, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { APPLICATION_STATUSES, WORK_STATUSES, type ApplicationStatus, type WorkStatus } from "@/lib/status";

async function log(entry: { artistId?: string | null; workId?: string | null; showId?: string | null; kind: string; body: string; actor: string }) {
  await db.insert(s.activity).values(entry);
}

async function addToWaitlist(artistId: string, showId: string | null) {
  const [last] = await db.select({ rank: s.waitlist.rank }).from(s.waitlist).orderBy(desc(s.waitlist.rank)).limit(1);
  await db
    .insert(s.waitlist)
    .values({ artistId, rank: (last?.rank ?? 0) + 1, fromShowId: showId, since: new Date().toISOString().slice(0, 10) })
    .onConflictDoNothing();
}

async function removeFromWaitlist(artistId: string) {
  const [row] = await db.delete(s.waitlist).where(eq(s.waitlist.artistId, artistId)).returning();
  if (row) await db.update(s.waitlist).set({ rank: sql`${s.waitlist.rank} - 1` }).where(gt(s.waitlist.rank, row.rank));
}

export async function setApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const actor = await requireAdmin();
  if (!APPLICATION_STATUSES.includes(status)) throw new Error("Unknown status");
  const [before] = await db.select({ status: s.applications.status }).from(s.applications).where(eq(s.applications.id, applicationId));
  if (before?.status === status) return;
  const [app] = await db
    .update(s.applications)
    .set({ status, decidedAt: new Date() })
    .where(eq(s.applications.id, applicationId))
    .returning();
  if (!app) throw new Error("Application not found");
  if (status === "Waitlist") await addToWaitlist(app.artistId, app.showId);
  else if (status === "Selected" || status === "Not selected" || status === "Withdrawn") await removeFromWaitlist(app.artistId);
  await log({ artistId: app.artistId, showId: app.showId, kind: "status", body: `Application set to ${status}`, actor });
  revalidatePath("/admin", "layout");
}

export async function setWorkStatus(showId: string, workId: string, status: WorkStatus) {
  const actor = await requireAdmin();
  if (!WORK_STATUSES.includes(status)) throw new Error("Unknown status");
  const [before] = await db
    .select({ status: s.showWorks.status })
    .from(s.showWorks)
    .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
  if (before?.status === status) return;
  const [row] = await db
    .update(s.showWorks)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)))
    .returning();
  if (!row) throw new Error("Work is not part of this show");
  const [work] = await db.select({ artistId: s.works.artistId, title: s.works.title }).from(s.works).where(eq(s.works.id, workId));
  await log({ artistId: work?.artistId, workId, showId, kind: "status", body: `"${work?.title}" set to ${status}`, actor });
  revalidatePath("/admin", "layout");
}

export async function addNote(artistId: string, body: string, showId?: string) {
  const actor = await requireAdmin();
  const text = body.trim();
  if (!text) return;
  await log({ artistId, showId: showId ?? null, kind: "note", body: text.slice(0, 4000), actor });
  revalidatePath("/admin", "layout");
}

export async function moveOnWaitlist(artistId: string, direction: "up" | "down") {
  await requireAdmin();
  const [me] = await db.select().from(s.waitlist).where(eq(s.waitlist.artistId, artistId));
  if (!me) return;
  const [other] =
    direction === "up"
      ? await db.select().from(s.waitlist).where(lt(s.waitlist.rank, me.rank)).orderBy(desc(s.waitlist.rank)).limit(1)
      : await db.select().from(s.waitlist).where(gt(s.waitlist.rank, me.rank)).orderBy(asc(s.waitlist.rank)).limit(1);
  if (!other) return;
  await db.transaction(async (tx) => {
    await tx.update(s.waitlist).set({ rank: -1 }).where(eq(s.waitlist.artistId, me.artistId));
    await tx.update(s.waitlist).set({ rank: me.rank }).where(eq(s.waitlist.artistId, other.artistId));
    await tx.update(s.waitlist).set({ rank: other.rank }).where(eq(s.waitlist.artistId, me.artistId));
  });
  revalidatePath("/admin/waitlist");
}

export async function updateWaitlistEntry(artistId: string, fields: { note?: string; carryForward?: boolean }) {
  const actor = await requireAdmin();
  await db.update(s.waitlist).set(fields).where(eq(s.waitlist.artistId, artistId));
  if (fields.note !== undefined) await log({ artistId, kind: "waitlist", body: `Waitlist note: ${fields.note}`, actor });
  revalidatePath("/admin/waitlist");
}

export async function removeFromWaitlistAction(artistId: string) {
  const actor = await requireAdmin();
  await removeFromWaitlist(artistId);
  await log({ artistId, kind: "waitlist", body: "Removed from waitlist", actor });
  revalidatePath("/admin", "layout");
}
