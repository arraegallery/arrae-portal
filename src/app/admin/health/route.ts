import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { signedImageUrls } from "@/lib/images";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin-only timing check: runs each step the Sandbox page needs, one at a time. */
export async function GET() {
  await requireAdmin();
  const steps: { step: string; ms: number; rows?: number; error?: string }[] = [];
  const time = async (step: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const r = await Promise.race([fn(), new Promise((_, no) => setTimeout(() => no(new Error("no answer after 15s")), 15_000))]);
      steps.push({ step, ms: Date.now() - t, rows: Array.isArray(r) ? r.length : undefined });
      return r;
    } catch (e) {
      steps.push({ step, ms: Date.now() - t, error: (e as Error).message });
      return null;
    }
  };
  await time("db: one tiny query", () => db.select({ id: s.shows.id }).from(s.shows).limit(1));
  await time("db: shows", () => db.select().from(s.shows));
  await time("db: works", () => db.select({ id: s.works.id, title: s.works.title }).from(s.works));
  await time("db: artists", () => db.select({ id: s.artists.id, name: s.artists.name }).from(s.artists));
  const images = (await time("db: first images", () => db.select().from(s.workImages).where(eq(s.workImages.position, 0)))) as
    | { thumbPath: string | null; storagePath: string | null }[]
    | null;
  await time("db: show works", () => db.select().from(s.showWorks));
  await time("db: waitlist", () => db.select({ id: s.waitlist.artistId }).from(s.waitlist));
  await time("db: sandbox items", () => db.select().from(s.sandboxItems).orderBy(asc(s.sandboxItems.position)));
  await time("db: 8 queries at once", () => Promise.all(Array.from({ length: 8 }, () => db.select({ id: s.shows.id }).from(s.shows))));
  if (images) await time("storage: sign image links", () => signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath)));
  return Response.json({ at: new Date().toISOString(), region: process.env.VERCEL_REGION ?? null, steps }, { headers: { "Cache-Control": "no-store" } });
}
