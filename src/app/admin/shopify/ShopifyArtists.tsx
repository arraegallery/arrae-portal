"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ArtistDiff, getArtistSync } from "@/lib/shopify/sync";
import { createCollectionAction, linkCollectionAction, updateCollectionAction } from "./actions";

type Rows = Extract<Awaited<ReturnType<typeof getArtistSync>>, { connected: true }>["rows"];
type Row = Rows[number];
type Filter = Row["state"];

const LABELS: Record<Filter, string> = {
  new: "No collection yet",
  differs: "Different on Shopify",
  missing: "Collection not found",
  matches: "Matches",
};

const STORE = "https://arraegallery.com";

export function ShopifyArtists({ rows }: { rows: Rows }) {
  const count = (f: Filter) => rows.filter((r) => r.state === f).length;
  const order: Filter[] = ["new", "differs", "missing", "matches"];
  const [filter, setFilter] = useState<Filter>(order.find((f) => count(f) > 0) ?? "matches");
  const shown = rows.filter((r) => r.state === filter);
  return (
    <section>
      <p className="mb-3 max-w-3xl text-sm text-muted">
        {rows.length} accepted artists (an application or a work Selected for a show). Each needs a Shopify collection: their name, ARRAE bio and photo, on the &ldquo;artists&rdquo; page
        design.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {order.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm ring-1 ${filter === f ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
            {LABELS[f]} ({count(f)})
          </button>
        ))}
      </div>
      {!shown.length && <p className="text-sm text-muted">Nothing here.</p>}
      <ul className="space-y-3">
        {shown.map((r) => (
          <ArtistCard key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

function ArtistCard({ r }: { r: Row }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [handle, setHandle] = useState(r.proposedHandle);
  const [confirming, setConfirming] = useState(false);
  const [fields, setFields] = useState<ArtistDiff[]>(r.diffs);
  const run = (fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>, message: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        setDone(message);
        setConfirming(false);
        router.refresh();
      }
    });

  return (
    <li className="flex gap-4 rounded-lg bg-white p-4 ring-1 ring-line">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded bg-paper">
        {r.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photo} alt={r.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted">No photo</div>
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link href={`/admin/artists/${r.id}`} className="font-display text-xl hover:underline">
            {r.name}
          </Link>
          {r.collection && (
            <a href={`${STORE}/collections/${r.collection.handle}`} target="_blank" rel="noreferrer" className="text-xs text-muted underline">
              /collections/{r.collection.handle} · {r.collection.products} products
            </a>
          )}
          {r.worksOnShopify > 0 && <span className="text-xs text-muted">{r.worksOnShopify} works linked to Shopify products</span>}
        </div>

        {done && <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-emerald-900">{done}</p>}
        {error && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-rose-900">{error}</p>}

        {(r.state === "new" || r.state === "missing") && !done && (
          <div className="mt-2 space-y-2">
            {r.state === "missing" && (
              <p className="text-amber-900">
                The portal says /collections/{r.handle}, but there&rsquo;s no such collection on Shopify (renamed or deleted?).
              </p>
            )}
            {r.suggestion && (
              <div className="rounded bg-sky-50 p-2 ring-1 ring-sky-200">
                Shopify already has <span className="font-medium">{r.suggestion.title}</span> (/collections/{r.suggestion.handle}, {r.suggestion.productsCount} products). Is that this
                artist?{" "}
                <button disabled={pending} onClick={() => run(() => linkCollectionAction(r.id, r.suggestion!.handle), `Linked to /collections/${r.suggestion!.handle}.`)} className="ml-1 rounded bg-sky-900 px-2 py-0.5 text-xs text-white disabled:opacity-40">
                  Yes, link it
                </button>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">What will be created</p>
              <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted">Title</dt>
                <dd>{r.name}</dd>
                <dt className="text-muted">Web address</dt>
                <dd className="flex flex-wrap items-center gap-1">
                  <span className="text-muted">arraegallery.com/collections/</span>
                  <input value={handle} onChange={(e) => setHandle(e.target.value)} className="w-64 rounded px-2 py-0.5 ring-1 ring-line" />
                </dd>
                <dt className="text-muted">Description</dt>
                <dd>{r.bio ? <p className="max-h-32 overflow-y-auto whitespace-pre-line rounded bg-paper p-2 text-xs">{r.bio}</p> : <span className="text-rose-800">No ARRAE bio yet. Add one on the artist&rsquo;s profile first.</span>}</dd>
                <dt className="text-muted">Image</dt>
                <dd>{r.hasPhoto ? "The artist photo shown here" : <span className="text-amber-800">No photo in the portal (you can add one later on Shopify or the profile)</span>}</dd>
                <dt className="text-muted">Page design</dt>
                <dd>artists · sorted Best selling · on all sales channels</dd>
              </dl>
            </div>
            {!confirming ? (
              <button disabled={pending || !r.bio || !handle.trim()} onClick={() => setConfirming(true)} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40">
                Create collection on Shopify…
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2 ring-1 ring-amber-200">
                <span>This creates the collection on the live store right away.</span>
                <button disabled={pending} onClick={() => run(() => createCollectionAction(r.id, handle), "Collection created on Shopify.")} className="rounded-md bg-ink px-3 py-1 text-white disabled:opacity-40">
                  {pending ? "Creating…" : "Yes, create it"}
                </button>
                <button disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-3 py-1 ring-1 ring-line">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {r.state === "differs" && r.collection && !done && (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Tick what to send from the portal to Shopify</p>
            {r.diffs.includes("title") && (
              <DiffRow field="title" fields={fields} setFields={setFields} label="Name" portal={r.name} shopify={r.collection.title} />
            )}
            {r.diffs.includes("bio") && (
              <DiffRow
                field="bio"
                fields={fields}
                setFields={setFields}
                label="Bio"
                portal={<p className="max-h-40 overflow-y-auto whitespace-pre-line text-xs">{r.bio}</p>}
                shopify={<div className="max-h-40 overflow-y-auto text-xs" dangerouslySetInnerHTML={{ __html: r.collection.bio || "<em>empty</em>" }} />}
              />
            )}
            {r.diffs.includes("image") && <DiffRow field="image" fields={fields} setFields={setFields} label="Image" portal="Artist photo" shopify="No image" />}
            <button
              disabled={pending || !fields.length}
              onClick={() => run(() => updateCollectionAction(r.id, fields), "Shopify collection updated.")}
              className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
            >
              {pending ? "Updating…" : `Update Shopify (${fields.length})`}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function DiffRow({
  field,
  fields,
  setFields,
  label,
  portal,
  shopify,
}: {
  field: ArtistDiff;
  fields: ArtistDiff[];
  setFields: (f: ArtistDiff[]) => void;
  label: string;
  portal: React.ReactNode;
  shopify: React.ReactNode;
}) {
  const on = fields.includes(field);
  return (
    <div className="grid gap-2 rounded bg-paper p-2 sm:grid-cols-[8rem_1fr_1fr]">
      <label className="flex items-start gap-2 font-medium">
        <input type="checkbox" checked={on} onChange={(e) => setFields(e.target.checked ? [...fields, field] : fields.filter((f) => f !== field))} className="mt-1" />
        {label}
      </label>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Portal</p>
        {portal}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Shopify now</p>
        {shopify}
      </div>
    </div>
  );
}
