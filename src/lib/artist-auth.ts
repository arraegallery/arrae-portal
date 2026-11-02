import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { teamRoleFor } from "./team";
import { supabaseConfigured, supabaseForRequest } from "./supabase/server";

const devArtistEmail = () => (process.env.NODE_ENV !== "production" ? process.env.DEV_ARTIST_EMAIL?.toLowerCase() : undefined);

/** Artist records whose email matches. One person can have more than one record. */
export async function artistsForEmail(email: string) {
  return db
    .select()
    .from(s.artists)
    .where(eq(sql`lower(trim(${s.artists.email}))`, email.trim().toLowerCase()))
    .orderBy(asc(s.artists.createdAt));
}

/** The signed-in user's email, or null. */
export async function signedInEmail(): Promise<string | null> {
  const dev = devArtistEmail();
  if (dev) return dev;
  if (!supabaseConfigured) return null;
  const supabase = await supabaseForRequest();
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

/**
 * The signed-in artist: their main record plus the ids of every record with their
 * email. Sends anyone else to sign in. Admins are sent to the admin workspace.
 */
export async function requireArtist() {
  const email = await signedInEmail();
  if (!email) redirect("/login");
  const records = await artistsForEmail(email);
  if (!records.length) {
    if (await teamRoleFor(email)) redirect("/admin");
    const [signup] = await db.select({ email: s.applicantSignups.email }).from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
    if (signup) redirect("/apply/start");
    redirect("/login?error=no-artist");
  }
  const artistIds = records.map((r) => r.id);
  await markSeen(artistIds);
  return { email, artist: records[0], artistIds };
}

/** Records the visit for the "Last signed in" column, at most once every 10 minutes. */
async function markSeen(artistIds: string[]) {
  const now = new Date();
  const stale = new Date(now.getTime() - 10 * 60 * 1000);
  try {
    await db
      .update(s.artists)
      .set({ lastSeenAt: now })
      .where(and(inArray(s.artists.id, artistIds), or(isNull(s.artists.lastSeenAt), lt(s.artists.lastSeenAt, stale))));
  } catch (e) {
    console.error("markSeen failed", e);
  }
}
