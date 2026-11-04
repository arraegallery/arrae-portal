import { optOut, validUnsubscribe } from "@/lib/unsubscribe";

/** One-click unsubscribe (RFC 8058), called by Gmail or Apple Mail when someone presses their own Unsubscribe button. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const e = url.searchParams.get("e") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!validUnsubscribe(e, t)) return new Response("Invalid link", { status: 400 });
  await optOut(e, "one-click");
  return new Response("Unsubscribed", { status: 200 });
}

/** Opening the one-click address in a browser goes to the normal page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return Response.redirect(new URL(`/unsubscribe${url.search}`, url.origin), 302);
}
