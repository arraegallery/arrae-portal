"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireArtist } from "@/lib/artist-auth";
import { cleanSignature, renderAgreementPdf } from "@/lib/agreement";
import { IMAGE_BUCKET } from "@/lib/images";
import { arraeRecipients, notifyEmail, portalUrl } from "@/lib/notify";
import { readOnboarding } from "@/lib/onboarding";
import { supabaseAdmin } from "@/lib/supabase/server";

/** The artist signs their agreement. Saves the signature and a signed PDF with a signing log. */
export async function signAgreement(input: { id: string; name: string; signature: string; consent: boolean }) {
  const me = await requireArtist();
  const [a] = await db
    .select()
    .from(s.agreements)
    .where(and(eq(s.agreements.id, input.id), isNull(s.agreements.voidedAt)));
  if (!a || !me.artistIds.includes(a.artistId)) throw new Error("This agreement isn't available. Please reload the page.");
  if (a.signedAt) throw new Error("You've already signed this agreement.");
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 160);
  if (name.length < 2) throw new Error("Type your full name");
  if (!input.consent) throw new Error("Tick the box to agree to sign electronically");
  const signature = cleanSignature(input.signature);
  if (!signature) throw new Error("Draw your signature in the box");

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const signedAt = new Date();
  const [row] = await db
    .update(s.agreements)
    .set({ artistName: name, artistSignature: signature, artistEmail: me.email, artistIp: ip, artistUserAgent: h.get("user-agent")?.slice(0, 500) ?? null, signedAt })
    .where(and(eq(s.agreements.id, a.id), isNull(s.agreements.signedAt)))
    .returning();
  if (!row) throw new Error("You've already signed this agreement.");

  const pdf = await renderAgreementPdf(row);
  const path = `agreements/${row.artistId}/${row.id}.pdf`;
  const { error } = await supabaseAdmin().storage.from(IMAGE_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (!error) await db.update(s.agreements).set({ pdfPath: path }).where(eq(s.agreements.id, row.id));

  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, row.artistId));
  const onboarding = readOnboarding(artist?.onboarding);
  await db.update(s.artists).set({ onboarding: { ...onboarding, agreement: true } }).where(eq(s.artists.id, row.artistId));
  await db.insert(s.activity).values({ artistId: row.artistId, kind: "note", body: `Signed the Partnership Agreement as "${name}"`, actor: me.email });
  await notifyEmail(arraeRecipients(), {
    subject: `${artist?.name ?? name} signed the Partnership Agreement`,
    heading: "Agreement signed",
    body: `${artist?.name ?? name} signed the ARRAE Artist Partnership Agreement as "${name}". The signed PDF is on their artist page.`,
    buttonLabel: "Open their page",
    buttonUrl: portalUrl(`/admin/artists/${encodeURIComponent(row.artistId)}`),
  });
  revalidatePath("/studio", "layout");
  revalidatePath(`/admin/artists/${row.artistId}`);
  revalidatePath("/admin/agreements");
}
