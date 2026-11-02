import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema as s } from "@/db";
import { artistsForEmail, signedInEmail } from "@/lib/artist-auth";
import { IMAGE_BUCKET } from "@/lib/images";
import { supabaseAdmin } from "@/lib/supabase/server";
import { teamRoleFor } from "@/lib/team";

export const dynamic = "force-dynamic";

const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

/** Opens a stored document: owners see everything, artists see their own visible files. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(s.documents).where(eq(s.documents.id, id));
  if (!d) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email && !devBypass()) return NextResponse.redirect(new URL("/login", req.url));
  const owner = devBypass() || (await teamRoleFor(email)) === "owner";
  const mine = !!email && d.visibleToArtist && (await artistsForEmail(email)).some((r) => r.id === d.artistId);
  if (!owner && !mine) return new NextResponse("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") ? { download: d.fileName } : {};
  const { data, error } = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUrl(d.storagePath, 300, download);
  if (error || !data) return new NextResponse("That file isn't available right now", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
