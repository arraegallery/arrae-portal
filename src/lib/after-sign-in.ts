import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { staffHomeFor } from "./team";
import { artistsForEmail } from "./artist-auth";

/** Where a freshly signed-in person goes: the team to the admin, applicants back to their application, artists to their studio. */
export async function homeFor(email: string) {
  const staff = await staffHomeFor(email);
  if (staff) return staff;
  const [signup] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
  if (signup && !signup.submittedAt) {
    const isArtist = (await artistsForEmail(email)).length > 0;
    if (!isArtist || (signup.lastLinkAt && Date.now() - signup.lastLinkAt.getTime() < 24 * 3600 * 1000)) return "/apply/start";
  }
  return "/studio";
}
