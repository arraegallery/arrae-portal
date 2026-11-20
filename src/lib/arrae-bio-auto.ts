import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { ARRAE_BIO_PROMPT } from "./arrae-bio-prompt";

/**
 * Writes ARRAE bios with Claude from the artist's own bio, using Anai's prompt word for word.
 * Runs on its own when an artist is accepted (application set to Selected, or the sandbox is
 * finalized). It only fills an empty ARRAE bio: a bio someone already wrote is never replaced.
 * Needs ANTHROPIC_API_KEY in Vercel; without it nothing happens.
 */
export const arraeBioWriterOn = () => !!process.env.ANTHROPIC_API_KEY;

const MODEL = "claude-opus-5-5";

/** Claude's ARRAE bio for one artist's own bio. */
export async function writeArraeBio(name: string, ownBio: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // If the model declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `${ARRAE_BIO_PROMPT}\n\nReply with the finished biography only: no title, no notes, no preamble. Separate paragraphs with a blank line.`,
    messages: [{ role: "user", content: `Artist: ${name}\n\nArtist biography:\n${ownBio.trim()}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to write this bio");
  if (response.stop_reason === "max_tokens") throw new Error("The bio came back cut off");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude sent back an empty bio");
  return text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, ", ");
}

/**
 * Fills the ARRAE bio for each of these artists that has its own bio and no ARRAE bio yet.
 * Returns how many were written. Failures are logged and skipped, so one artist can't stop the rest.
 */
export async function fillArraeBios(artistIds: string[], actor = "portal (automatic)") {
  if (!arraeBioWriterOn() || !artistIds.length) return 0;
  const rows = await db
    .select({ id: s.artists.id, name: s.artists.name, bio: s.artists.bio, arraeBio: s.artists.arraeBio })
    .from(s.artists)
    .where(inArray(s.artists.id, [...new Set(artistIds)]));
  const todo = rows.filter((a) => !a.arraeBio?.trim() && a.bio?.trim());
  let written = 0;
  // A few at a time, so a whole show's worth finishes quickly without flooding the API.
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((a) => writeArraeBio(a.name, a.bio!)));
    for (let j = 0; j < batch.length; j++) {
      const a = batch[j];
      const r = results[j];
      if (r.status === "rejected") {
        const why = (r.reason as Error)?.message ?? String(r.reason);
        console.error(`ARRAE bio for ${a.id} failed:`, why);
        await db.insert(s.activity).values({ artistId: a.id, kind: "edit", body: `Couldn't write the ARRAE bio automatically: ${why}`, actor });
        continue;
      }
      // Only if it is still empty: someone may have typed one in the meantime.
      const [saved] = await db
        .update(s.artists)
        .set({ arraeBio: r.value })
        .where(and(eq(s.artists.id, a.id), sql`coalesce(trim(${s.artists.arraeBio}), '') = ''`))
        .returning({ id: s.artists.id });
      if (!saved) continue;
      written++;
      await db.insert(s.activity).values({ artistId: a.id, kind: "edit", body: "ARRAE bio written by Claude from the artist's own bio (please check it)", actor });
    }
  }
  return written;
}
