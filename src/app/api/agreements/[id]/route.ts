import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema as s } from "@/db";
import { artistsForEmail, signedInEmail } from "@/lib/artist-auth";
import { renderAgreementPdf } from "@/lib/agreement";
import { IMAGE_BUCKET } from "@/lib/images";
import { supabaseAdmin } from "@/lib/supabase/server";
import { teamRoleFor } from "@/lib/team";

export const dynamic = "force-dynamic";

const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

/** The signed PDF, for ARRAE owners and for the artist who signed it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [a] = await db.select().from(s.agreements).where(eq(s.agreements.id, id));
  if (!a?.signedAt) return new NextResponse("Not found", { status: 404 });

  const email = await signedInEmail();
  if (!email && !devBypass()) return NextResponse.redirect(new URL("/login", _req.url));
  const owner = devBypass() || (await teamRoleFor(email)) === "owner";
  const mine = !!email && (await artistsForEmail(email)).some((r) => r.id === a.artistId);
  if (!owner && !mine) return new NextResponse("Not found", { status: 404 });

  // Serve the stored copy; rebuild it from the saved record if storage didn't have it.
  let bytes: Uint8Array | null = null;
  if (a.pdfPath) {
    const { data } = await supabaseAdmin().storage.from(IMAGE_BUCKET).download(a.pdfPath);
    if (data) bytes = new Uint8Array(await data.arrayBuffer());
  }
  bytes ??= await renderAgreementPdf(a);
  const file = `ARRAE Partnership Agreement - ${(a.artistName ?? "Artist").replace(/[^\w .-]/g, "")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
