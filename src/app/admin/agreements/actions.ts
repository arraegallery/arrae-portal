"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { notifyEmail, portalUrl } from "@/lib/notify";
import { cleanSignature, getAgreementTemplate, getGallerySigner, sha256 } from "@/lib/agreement";

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);

function refresh(artistId?: string) {
  revalidatePath("/admin/agreements");
  if (artistId) revalidatePath(`/admin/artists/${artistId}`);
  revalidatePath("/studio", "layout");
}

/**
 * Sends the Partnership Agreement to one artist: freezes today's wording with their name,
 * signs it for ARRAE, and asks them (in their message thread and by email) to sign in their studio.
 */
export async function sendAgreement(artistId: string) {
  const actor = await requireOwner();
  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) throw new Error("That artist no longer exists");
  const [signed] = await db
    .select({ id: s.agreements.id })
    .from(s.agreements)
    .where(and(eq(s.agreements.artistId, artistId), isNull(s.agreements.voidedAt), isNull(s.agreements.signedAt)));
  // Only one open request at a time: a new send replaces an unsigned one.
  if (signed) await db.update(s.agreements).set({ voidedAt: new Date() }).where(eq(s.agreements.id, signed.id));

  const template = await getAgreementTemplate();
  const body = template.text.replaceAll("{{artist}}", artist.name);
  const gallery = await getGallerySigner();
  const id = `agr_${rand()}`;
  await db.insert(s.agreements).values({ id, artistId, body, bodyHash: sha256(body), sentBy: actor, galleryName: gallery.name, galleryTitle: gallery.title, gallerySignature: gallery.signature });

  const message = `Welcome to ARRAE! Your Artist Partnership Agreement is ready to sign. Open your studio and choose "Read and sign". It takes a couple of minutes, and you can download a signed copy right after.`;
  await db.insert(s.artistMessages).values({ artistId, sender: "arrae", body: message, actor, readByArraeAt: new Date() });
  await db.insert(s.activity).values({ artistId, kind: "note", body: "Sent the Partnership Agreement to sign", actor });
  const emailed = artist.email
    ? await notifyEmail([artist.email], {
        subject: "Your ARRAE Partnership Agreement is ready to sign",
        heading: "Your agreement is ready",
        body: `Hi ${artist.name.split(/\s+/)[0]},\n\n${message}`,
        buttonLabel: "Read and sign",
        buttonUrl: portalUrl("/studio/agreement"),
      })
    : false;
  refresh(artistId);
  return { id, emailed };
}

/** Cancels an unsigned request, for example if it went to the wrong person. */
export async function voidAgreement(id: string) {
  const actor = await requireOwner();
  const [row] = await db.update(s.agreements).set({ voidedAt: new Date() }).where(and(eq(s.agreements.id, id), isNull(s.agreements.signedAt))).returning();
  if (!row) throw new Error("A signed agreement can't be cancelled");
  await db.insert(s.activity).values({ artistId: row.artistId, kind: "note", body: "Cancelled the unsigned Partnership Agreement", actor });
  refresh(row.artistId);
}

/** The agreement wording for new sends. Agreements already sent keep the wording they were sent with. */
export async function saveAgreementTemplate(text: string | null) {
  await requireOwner();
  const t = text?.trim() ?? "";
  if (!t) await db.delete(s.appSettings).where(eq(s.appSettings.key, "agreement_template"));
  else {
    if (!t.includes("{{artist}}")) throw new Error("Keep {{artist}} where the artist's name goes");
    await db.insert(s.appSettings).values({ key: "agreement_template", value: t.slice(0, 60000) }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: t.slice(0, 60000) } });
  }
  refresh();
}

/** Who signs for ARRAE, and the signature drawn once and reused on every agreement sent after. */
export async function saveGallerySigner(input: { name: string; title: string; signature: string | null }) {
  await requireOwner();
  const name = input.name.trim().slice(0, 120);
  const title = input.title.trim().slice(0, 120);
  if (!name) throw new Error("Add the name that signs for ARRAE");
  const value = JSON.stringify({ name, title: title || "Founder", signature: cleanSignature(input.signature) });
  await db.insert(s.appSettings).values({ key: "agreement_gallery_signer", value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  refresh();
}
