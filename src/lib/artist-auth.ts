import { asc, eq, sql } from "drizzle-orm";
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
  return { email, artist: records[0], artistIds: records.map((r) => r.id) };
}
