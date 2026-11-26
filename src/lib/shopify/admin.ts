/**
 * Talks to ARRAE's Shopify store through the Admin GraphQL API.
 *
 * Two ways to connect (set in Vercel → Settings → Environment Variables):
 *  - SHOPIFY_SHOP (e.g. rx11qe-rh.myshopify.com) + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 *    from a Shopify Dev Dashboard app installed on the store. The portal swaps them for an
 *    access token (good for 24 hours) whenever it needs one.
 *  - SHOPIFY_SHOP + SHOPIFY_ADMIN_TOKEN (an older "custom app" token, shpat_…), if ARRAE has one.
 */

export const SHOPIFY_API_VERSION = "2026-10";

function shopDomain() {
  const raw = (process.env.SHOPIFY_SHOP || "").trim();
  return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function shopifyConfigured() {
  return !!shopDomain() && (!!process.env.SHOPIFY_ADMIN_TOKEN || (!!process.env.SHOPIFY_CLIENT_ID && !!process.env.SHOPIFY_CLIENT_SECRET));
}

/** Which settings are missing, for the setup panel. */
export function shopifyMissingSettings() {
  const missing: string[] = [];
  if (!shopDomain()) missing.push("SHOPIFY_SHOP");
  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    if (!process.env.SHOPIFY_CLIENT_ID) missing.push("SHOPIFY_CLIENT_ID");
    if (!process.env.SHOPIFY_CLIENT_SECRET) missing.push("SHOPIFY_CLIENT_SECRET");
  }
  return missing;
}

let cached: { token: string; until: number } | null = null;

async function accessToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID!,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify refused the app's sign-in (${res.status}). Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, and that the app is installed on the store. ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Shopify didn't hand back an access token.");
  // Renew ten minutes early.
  cached = { token: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 86_400) - 600) * 1000 };
  return data.access_token;
}

type GqlError = { message: string; extensions?: { code?: string } };

/** Runs one Admin GraphQL request. Waits and retries when Shopify says to slow down. */
export async function shopifyGql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!shopifyConfigured()) throw new Error("Shopify isn't connected yet. See the setup steps on the Shopify page.");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${shopDomain()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken() },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && !process.env.SHOPIFY_ADMIN_TOKEN && attempt === 0) {
      cached = null; // token expired early: get a new one
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify answered ${res.status}: ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { data?: T; errors?: GqlError[] };
    if (body.errors?.length) {
      if (body.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 6) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const msg = body.errors.map((e) => e.message).join("; ");
      if (/access denied|scope/i.test(msg)) throw new Error(`Shopify says the app is missing a permission: ${msg}. Add it to the app's access scopes and release a new version (see setup steps).`);
      throw new Error(`Shopify: ${msg}`);
    }
    return body.data as T;
  }
}

/** Throws the first userErrors message from a mutation payload. */
export function checkUserErrors(payload: { userErrors?: { field?: string[] | null; message: string }[] } | null | undefined, what: string) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) throw new Error(`${what}: ${errs.map((e) => (e.field?.length ? `${e.field.join(".")}: ` : "") + e.message).join("; ")}`);
}
