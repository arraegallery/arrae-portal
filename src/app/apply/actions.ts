"use server";

import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { artistsForEmail, signedInEmail } from "@/lib/artist-auth";
import { ensureApplication, logActivity } from "@/lib/applications";
import { BIO_MAX, BIO_MIN, CATEGORIES, MAX_WORKS, PRICE_MAX, PRICE_MIN, type ApplicationInput } from "@/lib/application-fields";
import { IMAGE_BUCKET } from "@/lib/images";
import { arraeRecipients, notifyEmail, portalUrl } from "@/lib/notify";
import { createPhotoSlots } from "@/lib/photos";
import { supabaseAdmin, supabaseConfigured, supabaseForRequest } from "@/lib/supabase/server";
import { getTerms } from "@/lib/terms";
import { sendSignInLink } from "@/lib/sign-in-link";
import { homeFor } from "@/lib/after-sign-in";
import { parseAmount } from "@/lib/amount";
import { asResult } from "@/lib/action-result";

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 1: an email address. We save it (so ARRAE can follow up) and send a link to continue. */
export async function startApplication(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) redirect("/apply?error=email");
  if (!supabaseConfigured) redirect("/apply?error=setup");
  const [existing] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
  const recent = existing?.lastLinkAt && Date.now() - existing.lastLinkAt.getTime() < 60_000;
  await db
    .insert(s.applicantSignups)
    .values({ email, lastLinkAt: new Date() })
    .onConflictDoUpdate({ target: s.applicantSignups.email, set: { lastLinkAt: new Date() } });
  if (!recent) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    let failed = false;
    try {
      await sendSignInLink(email, origin, { createUser: true, purpose: "apply" });
    } catch (e) {
      console.error("apply sign-in link failed", e);
      failed = true;
    }
    if (failed) redirect(`/apply?error=send`);
  }
  redirect(`/apply?sent=1&email=${encodeURIComponent(email)}`);
}

/** Step 1, other way in: the 6-digit code from the email, for when the link won't open. */
export async function applyWithCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const back = `/apply?sent=1&error=code&email=${encodeURIComponent(email)}`;
  if (!EMAIL.test(email) || token.length < 6) redirect(back);
  const supabase = await supabaseForRequest();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  const signedIn = data.user?.email?.toLowerCase();
  if (error || !signedIn) redirect(back);
  redirect(await homeFor(signedIn));
}

async function mySignup() {
  const email = await signedInEmail();
  if (!email) redirect("/apply");
  const [row] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
  if (row) return { email, signup: row };
  const [created] = await db.insert(s.applicantSignups).values({ email }).onConflictDoNothing().returning();
  return { email, signup: created ?? (await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email)))[0] };
}

/** Step 2: the artist has read the partnership terms and agrees. */
export async function agreeToTerms(formData: FormData) {
  const { email } = await mySignup();
  const terms = await getTerms();
  if (formData.get("agree") !== "yes") redirect("/apply/start?error=agree");
  if (String(formData.get("version")) !== terms.version) redirect("/apply/start?error=changed");
  await db.update(s.applicantSignups).set({ termsAgreedAt: new Date(), termsVersion: terms.version }).where(eq(s.applicantSignups.email, email));
  redirect("/apply/start");
}

async function agreed() {
  const me = await mySignup();
  const terms = await getTerms();
  if (!me.signup.termsAgreedAt || me.signup.termsVersion !== terms.version) throw new Error("Please read how we work with artists first");
  return me;
}

/** Saves the typed answers so the applicant can leave and pick up where they left off. Photos aren't included. */
export async function saveApplicationDraft(draft: Record<string, unknown>) {
  const { email } = await agreed();
  const json = JSON.stringify(draft ?? {});
  if (json.length > 60_000) throw new Error("That's too much text to save");
  await db.update(s.applicantSignups).set({ formDraft: JSON.parse(json), draftSavedAt: new Date() }).where(eq(s.applicantSignups.email, email));
  return { savedAt: new Date().toISOString() };
}

/** Signed upload slots for the application's photos, artist photo and CV. */
export async function prepareApplicationUploads(opts: { photosPerWork: number[]; artistPhoto: boolean; cvExt: string | null }) {
  const { email, signup } = await agreed();
  const counts = opts.photosPerWork.slice(0, MAX_WORKS);
  if (!counts.length) throw new Error("Add at least one work");
  const draftId = signup.draftId?.split(":")[0] || rand();
  const works = [];
  for (const n of counts) {
    const workId = `wrk_${rand()}`;
    works.push({ workId, slots: await createPhotoSlots(workId, Math.max(1, n)) });
  }
  const storage = supabaseAdmin().storage.from(IMAGE_BUCKET);
  const base = `artists/applicants/${draftId}`;
  let photo = null;
  if (opts.artistPhoto) {
    const r = await storage.createSignedUploadUrl(`${base}/photo-${rand()}.jpg`);
    if (r.error) throw new Error(`Couldn't prepare the upload: ${r.error.message}`);
    photo = { path: r.data.path, token: r.data.token };
  }
  let cv = null;
  const ext = opts.cvExt?.toLowerCase().replace(/[^a-z]/g, "");
  if (ext && ["pdf", "doc", "docx"].includes(ext)) {
    const r = await storage.createSignedUploadUrl(`${base}/cv-${rand()}.${ext}`);
    if (r.error) throw new Error(`Couldn't prepare the upload: ${r.error.message}`);
    cv = { path: r.data.path, token: r.data.token };
  }
  // Remember which work ids belong to this draft, so the submission can be checked.
  await db
    .update(s.applicantSignups)
    .set({ draftId: `${draftId}:${works.map((w) => w.workId).join(",")}` })
    .where(eq(s.applicantSignups.email, email));
  return { works, photo, cv };
}

const clean = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max);
const num = (v: string, label: string) => {
  const t = v.trim();
  if (!t) return null;
  const n = parseAmount(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}: "${t}" isn't a number we can read. Try something like 24, 24.5 or 24 1/2.`);
  return n;
};
const slug = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "artist";

/** Step 3: the application itself. Creates (or updates) the artist, their application and the works. */
export async function submitApplication(input: ApplicationInput) {
  return asResult(() => saveApplication(input));
}

async function saveApplication(input: ApplicationInput) {
  const { email, signup } = await agreed();
  const [draftId, idList = ""] = (signup.draftId ?? "").split(":");
  const allowedWorks = idList.split(",").filter(Boolean);
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, input.showId));
  if (!show || !show.openForSubmissions) throw new Error("Choose a show that's taking applications");

  const name = clean(input.name, 200);
  const phone = clean(input.phone, 60);
  const bio = clean(input.bio, 4000);
  if (!name) throw new Error("Add your artist name");
  if (!phone) throw new Error("Add your phone number");
  if (bio.length < BIO_MIN) throw new Error(`Your bio/statement needs at least ${BIO_MIN} characters (it has ${bio.length})`);
  if (bio.length > BIO_MAX) throw new Error(`Your bio/statement can be at most ${BIO_MAX} characters (it has ${bio.length})`);
  const prefix = `artists/applicants/${draftId}/`;
  if (!draftId || !input.photoPath?.startsWith(prefix)) throw new Error("Add a photo of yourself in your studio or at work");
  if (input.cvPath && !input.cvPath.startsWith(prefix)) throw new Error("Something went wrong with your CV upload. Please try again.");
  if (!input.works.length) throw new Error("Add at least one work");
  if (input.works.length > MAX_WORKS) throw new Error(`You can submit up to ${MAX_WORKS} works`);

  const works = input.works.map((w, i) => {
    const n = `Work ${i + 1}`;
    if (!allowedWorks.includes(w.workId)) throw new Error("Something went wrong with the upload. Please try again.");
    const title = clean(w.title, 300);
    if (!title) throw new Error(`${n}: add a title (Untitled is fine)`);
    const year = clean(w.year, 10);
    if (!/^\d{4}$/.test(year)) throw new Error(`${n}: the year should look like 2025`);
    const height = num(w.height, `${n} height`);
    const width = num(w.width, `${n} width`);
    if (!height || !width) throw new Error(`${n}: add the height and width`);
    const depth = num(w.depth, `${n} depth`);
    const unit = w.unit === "cm" ? "cm" : "in";
    if (!CATEGORIES.includes(w.category as (typeof CATEGORIES)[number])) throw new Error(`${n}: choose a category`);
    const medium = clean(w.medium, 300);
    if (!medium) throw new Error(`${n}: add the medium`);
    const description = clean(w.description, 10000);
    if (!description) throw new Error(`${n}: add a short description`);
    const price = num(w.price, `${n} price`);
    if (price === null || price < PRICE_MIN || price > PRICE_MAX) throw new Error(`${n}: the price should be between $${PRICE_MIN} and $${PRICE_MAX.toLocaleString()}`);
    const video = clean(w.processVideo, 500);
    if (video && !/^https?:\/\//i.test(video)) throw new Error(`${n}: the process video should be a link starting with https://`);
    const own = `works/${w.workId}/`;
    if (!w.images.length) throw new Error(`${n}: add a photo`);
    if (w.images.some((img) => !img.path.startsWith(own) || (img.thumbPath && !img.thumbPath.startsWith(own)))) throw new Error(`${n}: those photos don't belong to this work`);
    const size = `${height} x ${width}${depth ? ` x ${depth}` : ""} ${unit}`;
    return { ...w, title, year, height, width, depth, unit, medium, description, price, video, size };
  });

  // The artist: their existing record if this email is on file, otherwise a new one.
  const existing = (await artistsForEmail(email))[0];
  let artistId = existing?.id;
  const details = {
    phone,
    bio,
    social: clean(input.social, 300) || existing?.social || null,
    website: clean(input.website, 300) || existing?.website || null,
    education: clean(input.education, 500) || existing?.education || null,
    photoPath: input.photoPath,
    cvPath: input.cvPath || existing?.cvPath || null,
  };
  if (existing) {
    const [already] = await db
      .select({ workId: s.showWorks.workId })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(eq(s.showWorks.showId, show.id), eq(s.works.artistId, existing.id)));
    if (already) throw new Error(`You've already applied to ${show.name}. You can see it, and add works, in your studio.`);
    await db.update(s.artists).set(details).where(eq(s.artists.id, existing.id));
  } else {
    artistId = `art_${slug(name)}`;
    const [taken] = await db.select({ id: s.artists.id }).from(s.artists).where(eq(s.artists.id, artistId));
    if (taken) artistId = `${artistId}-${rand().slice(0, 5)}`;
    await db.insert(s.artists).values({ id: artistId, name, email, ...details });
  }
  const today = new Date().toISOString().slice(0, 10);
  const existingWorks = await db.select({ id: s.works.id }).from(s.works).where(inArray(s.works.id, works.map((w) => w.workId)));
  if (existingWorks.length) throw new Error("This application was already sent");
  for (const w of works) {
    await db.insert(s.works).values({
      id: w.workId,
      artistId: artistId!,
      title: w.title,
      year: w.year,
      category: w.category,
      medium: w.medium,
      description: w.description,
      priceUsd: w.price.toFixed(2),
      height: w.height,
      width: w.width,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.size,
      sizeConfidence: "high",
      processVideo: w.video || null,
      submittedOn: today,
    });
    await db.insert(s.workImages).values(w.images.map((img, i) => ({ id: `img_${rand()}`, workId: w.workId, position: i, storagePath: img.path, thumbPath: img.thumbPath, widthPx: img.w, heightPx: img.h })));
    await db.insert(s.showWorks).values({ showId: show.id, workId: w.workId, status: "Submitted" }).onConflictDoNothing();
  }
  await ensureApplication(artistId!, show.id);
  await db.update(s.applicantSignups).set({ submittedAt: new Date(), showId: show.id, artistId, draftId: null, formDraft: null }).where(eq(s.applicantSignups.email, email));
  await logActivity({ artistId, showId: show.id, kind: "submission", body: `Applied to ${show.name} with ${works.length} work${works.length === 1 ? "" : "s"}`, actor: email });

  const first = name.split(/\s+/)[0];
  await notifyEmail([email], {
    subject: `We received your application for ${show.name}`,
    heading: "Thank you for applying",
    body: `Hi ${first},\n\nWe received your application for ${show.name} with ${works.map((w) => `"${w.title}"`).join(", ")}.\n\nWe review every application carefully, and decisions are made a few weeks before the show opens. You can follow along, update your works and message us from your studio.`,
    buttonLabel: "Open my studio",
    buttonUrl: portalUrl("/studio"),
  });
  await notifyEmail(arraeRecipients(), {
    subject: `New application for ${show.name}: ${name}`,
    heading: `${name} applied to ${show.name}`,
    body: `${name} (${email}) applied with ${works.length} work${works.length === 1 ? "" : "s"}: ${works.map((w) => w.title).join(", ")}.${existing ? "\n\nThey were already on file, so their details were updated." : ""}`,
    buttonLabel: "Open the review board",
    buttonUrl: portalUrl(`/admin/review/${show.id}`),
  });
  return { show: show.name };
}
