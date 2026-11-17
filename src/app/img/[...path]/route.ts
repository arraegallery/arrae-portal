import { NextResponse, type NextRequest } from "next/server";
import { freshStorageLink, validImageLink } from "@/lib/images";

export const dynamic = "force-dynamic";

// Storage links made on this server instance, reused while they have plenty of time left.
const made = new Map<string, { url: string; until: number }>();
const LINK_SECONDS = 3600;
const BROWSER_KEEPS = 50 * 60; // under the link's hour, so a cached redirect never points at a dead link

/** Sends the browser to a fresh storage link for one image. The link in the page never expires on its own. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const path = parts.map(decodeURIComponent).join("/");
  const e = Number(req.nextUrl.searchParams.get("e"));
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!validImageLink(path, e, s)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  let hit = made.get(path);
  if (!hit || hit.until < Date.now() + BROWSER_KEEPS * 1000) {
    const url = await freshStorageLink(path, LINK_SECONDS);
    if (!url) return new NextResponse("Image unavailable, try again", { status: 503, headers: { "Cache-Control": "no-store" } });
    hit = { url, until: Date.now() + LINK_SECONDS * 1000 };
    if (made.size > 5000) made.clear();
    made.set(path, hit);
  }
  const keep = Math.max(60, Math.floor((hit.until - Date.now()) / 1000) - 600);
  return NextResponse.redirect(hit.url, { status: 302, headers: { "Cache-Control": `private, max-age=${Math.min(keep, BROWSER_KEEPS)}` } });
}
