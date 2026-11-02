import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** Makes sure an artist has an application row for a show, so they appear on its review board. */
export async function ensureApplication(artistId: string, showId: string) {
  const [existing] = await db
    .select({ id: s.applications.id })
    .from(s.applications)
    .where(and(eq(s.applications.artistId, artistId), eq(s.applications.showId, showId)));
  if (existing) return existing.id;
  const id = `app_${showId}_${artistId}`.slice(0, 120);
  await db
    .insert(s.applications)
    .values({ id, artistId, showId, status: "New", submittedOn: new Date().toISOString().slice(0, 10) })
    .onConflictDoNothing();
  return id;
}

export async function logActivity(entry: { artistId?: string | null; workId?: string | null; showId?: string | null; kind: string; body: string; actor: string }) {
  await db.insert(s.activity).values(entry);
}
