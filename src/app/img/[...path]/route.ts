import { NextResponse, type NextRequest } from "next/server";
import { IMAGE_BUCKET, validImageLink } from "@/lib/images";

export const dynamic = "force-dynamic";

const fail = (status: number, text: string) => new NextResponse(text, { status, headers: { "Cache-Control": "no-store" } });

/*
 * Supabase storage on this plan can't take hundreds of picture requests at once: it answers
 * "Too many connections" or 429, and a random handful of pictures fail. So:
 *  - each picture is one direct download (no separate signing step),
 *  - at most a few downloads run at once per server, the rest wait their turn,
 *  - a busy answer is retried after a short pause,
 *  - the answer is cached by Vercel's CDN and the browser, so each picture is fetched from
 *    storage about once. Stored files never change in place (a new upload gets a new path),
 *    and the link's signature is part of the cached address.
 */
const MAX_AT_ONCE = 4;
let running = 0;
const queue: (() => void)[] = [];
async function turn<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((go) => queue.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    queue.shift()?.();
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(path: string): Promise<Response | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const url = `${base}/storage/v1/object/authenticated/${IMAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  let wait = 0;
  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt) await pause(wait || Math.min(8000, 500 * 2 ** attempt) + Math.random() * 500);
    wait = 0;
    try {
      const res = await turn(() => fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key }, cache: "no-store", signal: AbortSignal.timeout(20_000) }));
      if (res.ok) return res;
      if (res.status === 400 || res.status === 404) return null; // really not there
      const after = Number(res.headers.get("retry-after"));
      if (after > 0) wait = Math.min(10_000, after * 1000);
      console.error(`image ${path}: storage answered ${res.status} (attempt ${attempt + 1})`);
    } catch (err) {
      console.error(`image ${path}: fetch failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** Sends one image's bytes from storage; the browser never talks to Supabase directly. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const path = parts.map(decodeURIComponent).join("/");
  const e = Number(req.nextUrl.searchParams.get("e"));
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!validImageLink(path, e, s)) return fail(404, "Not found");

  const res = await download(path);
  if (!res) return fail(503, "Image unavailable, try again");
  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=604800, immutable",
      "CDN-Cache-Control": "public, max-age=1209600",
    },
  });
}
