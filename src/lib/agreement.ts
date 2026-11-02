import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db, schema as s } from "@/db";
import { AGREEMENT_TITLE, ESIGN_CONSENT } from "./agreement-text";

/**
 * The ARRAE Artist Partnership Agreement, from "ARRAE_Artist_Partnership_Agreement_Final_Reviewed_January 2026.docx".
 * {{artist}} is replaced with the artist's name when the agreement is sent. Editable on the Agreements page.
 */
export const DEFAULT_AGREEMENT = `This Artist Partnership Agreement (the "Agreement") is entered into by and between {{artist}}, hereinafter referred to as the "Artist," and ARRAE Gallery, whose principal place of business is 3680 Grand Avenue, Miami, FL 33133, hereinafter referred to as the "Gallery." This Agreement sets forth the terms and conditions under which the Gallery will display, promote, and offer for sale artwork created and submitted by the Artist. The Effective Date of this Agreement is the date the Artist signs it below.

## 1. Artist Confirmation

The Artist affirms that all artwork submitted under this Agreement is an original creation of the Artist. The Artist further confirms that all representations made regarding the artwork, including but not limited to title, medium, materials, year of creation, collaborators (if any), and process, are accurate and factual. The Artist accepts sole responsibility for any misrepresentation or claims related to the artwork.

## 2. Term of Agreement

The initial term of this Agreement shall be for three (3) months, commencing on the Effective Date above. This term may be renewed or extended by mutual written consent of both parties.

## 3. Commission and Payment

The Artist shall receive fifty-five percent (55%) of the sale price for all sales of the Artist's work through the Gallery, and the Gallery shall receive forty-five percent (45%). The Gallery shall be responsible for covering all transaction fees. The Gallery shall remit payment to the Artist no earlier than thirty (30) days after cleared funds are received from the purchaser and no later than the end (closing date) of the applicable collection (Volumes) period.

## 4. Pricing

The Artist shall determine the retail price of each work submitted. The retail price must include the Gallery's commission. All artwork must be priced between one hundred dollars ($100) and ten thousand dollars ($10,000). The Artist agrees that comparable works or the same works offered through the Gallery will not be listed at a lower price elsewhere during the term of this Agreement. The Artist shall route any buyer introduced by the Gallery through the Gallery for purchases while the work is displayed and for six (6) months following the conclusion of this Agreement.

## 5. Discounts

The Gallery reserves the right to offer discounts of up to ten percent (10%) to facilitate sales or support promotional or charitable efforts. Any such discounts will be applied proportionally in accordance with the commission structure.

## 6. Delivery and Preparation

The Artist shall be responsible for delivering accepted artworks to the Gallery, either via shipping or scheduled drop-off. If shipping, the Artist shall ensure delivery within a pre-agreed timeframe. All works must be received ready to hang, clearly labeled with the Artist's name, title of the work, year, medium, and price. Each work must include a Certificate of Authenticity. If the Artist does not have a certificate, the Gallery may assist in preparing one, provided advance notice is given at the time the delivery is scheduled.

## 7. Exhibition Format

The Gallery will display the Artist's work in a salon-style presentation within a retail setting. In addition, the Gallery may offer the artwork for sale through its online platform under the same terms.

## 8. Promotion

The Gallery may use photographs of the Artist's work or images from the Artist's social media, website, or provided promotional materials to promote the artwork or gallery.

## 9. Insurance

The Gallery shall maintain general insurance coverage that includes the displayed artwork. The Artist shall be responsible for any applicable deductibles in the event of a claim. It is recommended that the Artist maintains independent insurance coverage for their work.

## 10. Termination and Return of Work

This Agreement may be terminated by either party upon seven (7) days written notice. The Artist may schedule in-person pick-up of any unsold artwork at no cost. However, the Gallery will not retain artwork for more than ten (10) days following the termination date. If the Artist requires work to be returned via shipping, the Artist shall bear all associated costs.

## 11. Non-Circumvention

If the Gallery introduces the Artist to a prospective buyer, any resulting sale, including sales of artworks not displayed at the Gallery, must be processed through the Gallery for the duration of this Agreement and for a period of six (6) months after the Artist ceases to show any work through the Gallery. If a relevant work is held by another gallery, the Artist must provide proof of a valid, signed consignment or representation agreement. This clause does not apply to other galleries owned or operated by the Artist or their family or domestic partner.

## 12. Access to Sales Records

The Gallery shall provide the Artist with information regarding sales that pertain to their artwork. The Artist shall not have access to sales or financial records concerning other artists or general gallery operations.

## 13. Dispute Resolution

Any disputes arising from or related to this Agreement shall be resolved through good faith negotiation. If unresolved, disputes shall be submitted to binding arbitration under the laws of the State of Florida.

## 14. Governing Law

This Agreement shall be governed by and construed in accordance with the laws of the State of Florida.

## 15. Entire Agreement

This Agreement constitutes the entire understanding between the Artist and the Gallery and supersedes all prior discussions or agreements, whether written or oral.`;

export { AGREEMENT_TITLE, ESIGN_CONSENT };

export type GallerySigner = { name: string; title: string; signature: string | null };

export async function getAgreementTemplate() {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "agreement_template"));
  return { text: row?.value?.trim() || DEFAULT_AGREEMENT, custom: !!row };
}

/** Who signs for ARRAE, and their saved signature (a PNG data URL drawn once on the Agreements page). */
export async function getGallerySigner(): Promise<GallerySigner> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "agreement_gallery_signer"));
  try {
    const v = row ? (JSON.parse(row.value) as Partial<GallerySigner>) : {};
    return { name: v.name || "Anai Fonte", title: v.title || "Founder", signature: v.signature ?? null };
  } catch {
    return { name: "Anai Fonte", title: "Founder", signature: null };
  }
}

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Accepts only small PNG data URLs from the signature pad. */
export function cleanSignature(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error("That signature didn't come through. Please draw it again.");
  if (dataUrl.length > 400_000) throw new Error("That signature is too large. Please clear it and draw it again.");
  return dataUrl;
}

const NY = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const NY_DAY = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });

/** The standard PDF fonts only cover basic Latin, so swap curly quotes and drop anything else they can't draw. */
const pdfSafe = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, "");

type Agreement = typeof s.agreements.$inferSelect;

/** Builds the signed PDF: the agreement, both signatures, and a signing log page. */
export async function renderAgreementPdf(a: Agreement): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${AGREEMENT_TITLE} - ${a.artistName ?? ""}`);
  pdf.setAuthor("ARRAE Gallery");
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const W = 612, H = 792, M = 64; // US Letter, margins
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, opts: { font?: PDFFont; size?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const font = opts.font ?? regular, size = opts.size ?? 11, lh = size * 1.4;
    for (const line of wrap(pdfSafe(text), font, size, W - 2 * M)) {
      ensure(lh);
      page.drawText(line, { x: M, y: y - size, size, font, color: opts.color ?? ink });
      y -= lh;
    }
    y -= opts.gap ?? 8;
  };

  write(AGREEMENT_TITLE, { font: bold, size: 18, gap: 6 });
  write(`Effective Date: ${a.signedAt ? NY_DAY(a.signedAt) : "the date the Artist signs below"}`, { size: 11, color: muted, gap: 14 });
  for (const block of a.body.trim().split(/\n\s*\n/)) {
    const b = block.trim();
    if (b.startsWith("## ")) {
      y -= 4;
      ensure(40);
      write(b.slice(3), { font: bold, size: 12.5, gap: 4 });
    } else write(b.replace(/\*\*|__/g, ""), { gap: 8 });
  }

  // Signatures
  const sigBlock = async (label: string, name: string, title: string | null, signature: string | null, date: Date | null) => {
    ensure(130);
    write(label, { font: bold, size: 12, gap: 6 });
    const top = y;
    if (signature) {
      const png = await pdf.embedPng(Buffer.from(signature.split(",")[1], "base64"));
      const scale = Math.min(200 / png.width, 56 / png.height);
      page.drawImage(png, { x: M, y: top - 56, width: png.width * scale, height: png.height * scale });
    } else page.drawText(pdfSafe(name), { x: M, y: top - 40, size: 24, font: script, color: ink });
    y = top - 62;
    page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: muted });
    y -= 4;
    write(`Signature`, { font: sans, size: 8, color: muted, gap: 6 });
    write(`Name: ${name}${title ? `, ${title}` : ""}`, { gap: 2 });
    write(`Date: ${date ? NY_DAY(date) : ""}`, { gap: 16 });
  };
  y -= 8;
  write("IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date written above.", { gap: 14 });
  await sigBlock("Artist", a.artistName ?? "", null, a.artistSignature, a.signedAt);
  await sigBlock("For ARRAE Gallery", a.galleryName, a.galleryTitle, a.gallerySignature, a.sentAt);

  // Signing log
  newPage();
  write("Signing log", { font: bold, size: 16, gap: 10 });
  const row = (k: string, v: string) => write(`${k}: ${v}`, { font: sans, size: 9.5, gap: 3 });
  row("Document", AGREEMENT_TITLE);
  row("Document ID", a.id);
  row("Document fingerprint (SHA-256 of the agreement text)", a.bodyHash);
  y -= 8;
  row("Sent and signed for ARRAE Gallery by", `${a.galleryName}, ${a.galleryTitle}${a.sentBy.includes("@") ? ` (${a.sentBy})` : " (sent automatically when the Artist first signed in)"}`);
  row("Sent", NY(a.sentAt));
  y -= 8;
  row("Signed by the Artist", a.artistName ?? "");
  row("Artist email (verified by email sign-in link)", a.artistEmail ?? "");
  row("Signed", a.signedAt ? NY(a.signedAt) : "");
  row("IP address", a.artistIp ?? "unknown");
  row("Browser", (a.artistUserAgent ?? "unknown").slice(0, 300));
  y -= 8;
  write(`The Artist confirmed: "${ESIGN_CONSENT}"`, { font: sans, size: 9.5, color: muted });
  write("Signed electronically in the ARRAE artist portal (arrae-portal.vercel.app).", { font: sans, size: 9.5, color: muted });

  return pdf.save();
}

/** The artist's current agreement: the newest one that hasn't been cancelled. */
export async function currentAgreement(artistIds: string[]) {
  if (!artistIds.length) return null;
  const rows = await db.select().from(s.agreements).where(and(inArray(s.agreements.artistId, artistIds), isNull(s.agreements.voidedAt))).orderBy(desc(s.agreements.sentAt)).limit(1);
  return rows[0] ?? null;
}

// ---- Sending, first sign-in, reminders ----

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);

/** Freezes today's wording with the artist's name and signs it for ARRAE. Cancels any older unsigned copy. */
export async function createAgreement(artistId: string, sentBy: string) {
  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) throw new Error("That artist no longer exists");
  await db
    .update(s.agreements)
    .set({ voidedAt: new Date() })
    .where(and(eq(s.agreements.artistId, artistId), isNull(s.agreements.voidedAt), isNull(s.agreements.signedAt)));
  const body = (await getAgreementTemplate()).text.replaceAll("{{artist}}", artist.name);
  const gallery = await getGallerySigner();
  const id = `agr_${rand()}`;
  await db.insert(s.agreements).values({ id, artistId, body, bodyHash: sha256(body), sentBy, galleryName: gallery.name, galleryTitle: gallery.title, gallerySignature: gallery.signature });
  return { id, artist };
}

/**
 * Who is asked to sign the first time they open their studio, without ARRAE sending it by hand:
 * "off", "unsigned" (selected artists not yet marked signed) or "all" (every selected artist, even
 * those who signed an older copy outside the portal).
 */
export type AutoMode = "off" | "unsigned" | "all";
export async function getAgreementAuto(): Promise<{ mode: AutoMode; reminders: boolean }> {
  const rows = await db.select().from(s.appSettings).where(inArray(s.appSettings.key, ["agreement_auto", "agreement_reminders"]));
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const mode = get("agreement_auto");
  return { mode: mode === "off" || mode === "all" ? mode : "unsigned", reminders: get("agreement_reminders") !== "off" };
}

/** Called when an artist opens their studio: sets up their agreement if the auto setting covers them. */
export async function offerAgreementOnSignIn(artistIds: string[]) {
  if (!artistIds.length || (await currentAgreement(artistIds))) return;
  const { mode } = await getAgreementAuto();
  if (mode === "off") return;
  const [selected] = await db
    .select({ id: s.applications.artistId })
    .from(s.applications)
    .where(and(inArray(s.applications.artistId, artistIds), eq(s.applications.status, "Selected")))
    .limit(1);
  if (!selected) return;
  const [artist] = await db.select({ onboarding: s.artists.onboarding }).from(s.artists).where(eq(s.artists.id, selected.id));
  if (mode === "unsigned" && (artist?.onboarding as { agreement?: boolean } | undefined)?.agreement) return;
  const { id } = await createAgreement(selected.id, "first sign-in");
  await db.insert(s.activity).values({ artistId: selected.id, kind: "note", body: "Asked to sign the Partnership Agreement on first sign-in", actor: "portal" });
  return id;
}

/** Reminder schedule: 3 days after sending, then every 7 days, at most 3 reminders. */
export const REMINDER = { firstAfterDays: 3, everyDays: 7, max: 3 };

export function reminderDue(a: { signedAt: Date | null; voidedAt: Date | null; sentAt: Date; remindersSent: number; lastRemindedAt: Date | null }, now = new Date()) {
  if (a.signedAt || a.voidedAt || a.remindersSent >= REMINDER.max) return false;
  const day = 864e5;
  if (!a.lastRemindedAt) return now.getTime() - a.sentAt.getTime() >= REMINDER.firstAfterDays * day;
  return now.getTime() - a.lastRemindedAt.getTime() >= REMINDER.everyDays * day;
}
