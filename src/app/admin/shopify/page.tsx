import Link from "next/link";
import { shopifyConfigured, shopifyMissingSettings } from "@/lib/shopify/admin";
import { getArtistSync, getWorkSync } from "@/lib/shopify/sync";
import { requireOwner } from "@/lib/team";
import { ShopifyArtists } from "./ShopifyArtists";
import { ShopifyWorks } from "./ShopifyWorks";

export const maxDuration = 60;

export default async function ShopifyPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  await requireOwner();
  const { tab, show } = await searchParams;
  const current = tab === "works" ? "works" : "artists";
  const tabLink = (key: string, label: string, href: string) => (
    <Link href={href} className={`rounded-full px-4 py-1.5 text-sm ring-1 ${current === key ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:bg-paper"}`}>
      {label}
    </Link>
  );

  let body: React.ReactNode;
  let failure: string | null = null;
  if (!shopifyConfigured()) body = <SetupSteps missing={shopifyMissingSettings()} />;
  else {
    try {
      if (current === "artists") {
        const data = await getArtistSync();
        body = data.connected ? <ShopifyArtists rows={data.rows} /> : null;
      } else {
        const data = await getWorkSync(show);
        body = data.connected ? <ShopifyWorks data={data} /> : null;
      }
    } catch (e) {
      failure = (e as Error).message;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Shopify</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Compares the portal with the live store. Accepted artists need a collection; their selected works become products in that collection. Nothing changes on Shopify until you press a
          button and confirm it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabLink("artists", "Artists (collections)", "/admin/shopify")}
          {tabLink("works", "Artworks (products)", `/admin/shopify?tab=works${show ? `&show=${encodeURIComponent(show)}` : ""}`)}
          <Link href="/admin/shopify/check" className="rounded-full bg-white px-4 py-1.5 text-sm ring-1 ring-line hover:bg-paper">
            Check-over list
          </Link>
        </div>
      </section>
      {failure ? (
        <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          <p className="font-medium">Couldn&rsquo;t read the Shopify store.</p>
          <p className="mt-1">{failure}</p>
          <p className="mt-2 text-xs">Reload the page to try again. If it keeps happening, check the setup steps (Vercel settings and the app&rsquo;s permissions).</p>
        </div>
      ) : (
        body
      )}
    </main>
  );
}

function SetupSteps({ missing }: { missing: string[] }) {
  return (
    <section className="max-w-3xl rounded-lg bg-white p-5 text-sm ring-1 ring-line">
      <h2 className="font-display text-2xl">Connect the store (one time, about 10 minutes)</h2>
      <p className="mt-1 text-muted">The portal needs its own key to the store. Missing right now: {missing.join(", ")}.</p>
      <ol className="mt-4 list-decimal space-y-3 pl-5">
        <li>
          Open <span className="font-medium">dev.shopify.com</span> and sign in with the account that owns ARRAE Gallery. Click <span className="font-medium">Apps</span> →{" "}
          <span className="font-medium">Create app</span>. Name it <span className="font-medium">ARRAE Portal</span>.
        </li>
        <li>
          In the app, open <span className="font-medium">Versions</span> → <span className="font-medium">Create version</span>. Under <span className="font-medium">Access → Scopes</span>, paste:
          <pre className="mt-1 whitespace-pre-wrap rounded bg-paper p-2 text-xs">read_products,write_products,read_inventory,write_inventory,read_locations,read_publications,write_publications</pre>
          Leave the App URL as it is. Click <span className="font-medium">Release</span>.
        </li>
        <li>
          Go back to the app&rsquo;s <span className="font-medium">Home</span>, click <span className="font-medium">Install app</span>, pick <span className="font-medium">ARRAE Gallery</span>, then{" "}
          <span className="font-medium">Install</span>.
        </li>
        <li>
          In the app open <span className="font-medium">Settings</span>. Copy the <span className="font-medium">Client ID</span> and the <span className="font-medium">Client secret</span>.
        </li>
        <li>
          In Vercel open the <span className="font-medium">arrae-portal</span> project → <span className="font-medium">Settings</span> → <span className="font-medium">Environment Variables</span>. Add
          three, each for all environments:
          <ul className="mt-1 list-disc pl-5">
            <li>
              <code>SHOPIFY_SHOP</code> = <code>rx11qe-rh.myshopify.com</code>
            </li>
            <li>
              <code>SHOPIFY_CLIENT_ID</code> = the Client ID
            </li>
            <li>
              <code>SHOPIFY_CLIENT_SECRET</code> = the Client secret
            </li>
          </ul>
        </li>
        <li>
          In Vercel open <span className="font-medium">Deployments</span>, click the ⋯ on the top one → <span className="font-medium">Redeploy</span>. When it&rsquo;s done, reload this page.
        </li>
      </ol>
    </section>
  );
}
