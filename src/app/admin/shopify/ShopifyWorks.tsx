"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { getWorkSync, WorkDiff, WorkUpdate } from "@/lib/shopify/sync";
import { createProductsAction, createShowCollectionAction, linkProductAction, updateProductAction } from "./actions";

type Data = Extract<Awaited<ReturnType<typeof getWorkSync>>, { connected: true }>;
type Row = Data["rows"][number];
type State = Row["state"];

const LABELS: Record<State, string> = {
  new: "Ready to create",
  blocked: "Needs fixing first",
  link: "Already on Shopify, not linked",
  differs: "Different on Shopify",
  matches: "Matches",
};

const DIFF_LABELS: Record<WorkDiff, string> = {
  title: "Title",
  price: "Price",
  vendor: "Artist name (vendor)",
  collection: "In the artist's collection",
  showTag: "In this show's collection",
};

const STORE = "https://arraegallery.com";
const BATCH = 3;

export function ShopifyWorks({ data }: { data: Data }) {
  const router = useRouter();
  const { shows, show, rows, showCollection, tag } = data;
  const count = (s: State) => rows.filter((r) => r.state === s).length;
  const order: State[] = ["new", "blocked", "link", "differs", "matches"];
  const [filter, setFilter] = useState<State>(order.find((s) => count(s) > 0) ?? "matches");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<null | "create" | "update">(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [bulkFields, setBulkFields] = useState<WorkDiff[]>(["collection", "showTag", "vendor"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = rows.filter((r) => r.state === filter);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) {
      const k = r.artist?.name ?? "No artist";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [shown]);
  const tickable = filter === "new" || filter === "differs";
  const tickedHere = shown.filter((r) => ticked.has(r.id));

  const toggle = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const createTicked = () =>
    start(async () => {
      setError(null);
      const ids = tickedHere.map((r) => r.id);
      let done = 0;
      for (let i = 0; i < ids.length; i += BATCH) {
        setProgress(`Creating ${Math.min(i + BATCH, ids.length)} of ${ids.length}…`);
        const res = await createProductsAction(ids.slice(i, i + BATCH), show!.id);
        if (!res.ok) {
          setError(res.error);
          break;
        }
        const next: Record<string, { ok: boolean; message: string }> = {};
        for (const x of res.value) {
          next[x.id] = { ok: x.ok, message: x.ok ? `Created /products/${x.message}` : x.message };
          if (x.ok) done++;
        }
        setResults((prev) => ({ ...prev, ...next }));
      }
      setProgress(`Done: ${done} of ${ids.length} created.`);
      setConfirming(null);
      setTicked(new Set());
      router.refresh();
    });

  const updateTicked = () =>
    start(async () => {
      setError(null);
      const list = tickedHere;
      let done = 0;
      for (const [i, r] of list.entries()) {
        setProgress(`Updating ${i + 1} of ${list.length}…`);
        const fields = r.diffs.filter((d) => bulkFields.includes(d));
        if (!fields.length) continue;
        const res = await updateProductAction(r.id, show!.id, fields);
        setResults((prev) => ({ ...prev, [r.id]: res.ok ? { ok: true, message: `Updated (${fields.map((f) => DIFF_LABELS[f]).join(", ")})` } : { ok: false, message: res.error } }));
        if (res.ok) done++;
      }
      setProgress(`Done: ${done} of ${list.length} updated.`);
      setConfirming(null);
      setTicked(new Set());
      router.refresh();
    });

  const makeShowCollection = () =>
    start(async () => {
      setError(null);
      const res = await createShowCollectionAction(show!.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <select value={show?.id ?? ""} onChange={(e) => router.push(`/admin/shopify?tab=works&show=${encodeURIComponent(e.target.value)}`)} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line">
          {shows.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <span className="text-muted">Works Selected for this show.</span>
        {showCollection ? (
          <span className="text-muted">
            Show collection:{" "}
            <a href={`${STORE}/collections/${showCollection.handle}`} target="_blank" rel="noreferrer" className="underline">
              {showCollection.title}
            </a>{" "}
            ({showCollection.smart ? `fills itself with works tagged “${tag}”` : "works are added to it"}, {showCollection.products} now)
          </span>
        ) : (
          show && (
            <span className="flex items-center gap-2 text-amber-900">
              No {show.name} collection on Shopify yet.
              <button disabled={pending} onClick={makeShowCollection} className="rounded bg-ink px-2 py-0.5 text-xs text-white disabled:opacity-40" title={`Creates an automatic collection of products tagged “${tag}”`}>
                Create it (works tagged “{tag}”)
              </button>
            </span>
          )
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {order.map((s) => (
          <button
            key={s}
            onClick={() => {
              setFilter(s);
              setConfirming(null);
            }}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${filter === s ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}
          >
            {LABELS[s]} ({count(s)})
          </button>
        ))}
      </div>

      {tickable && shown.length > 0 && (
        <div className="sticky top-14 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-line">
          <button onClick={() => setTicked(new Set([...ticked, ...shown.map((r) => r.id)]))} className="rounded px-2 py-1 ring-1 ring-line">
            Tick all {shown.length}
          </button>
          <button onClick={() => setTicked(new Set())} className="rounded px-2 py-1 ring-1 ring-line">
            Clear
          </button>
          {filter === "differs" && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Send:</span>
              {(Object.keys(DIFF_LABELS) as WorkDiff[]).map((f) => (
                <label key={f} className="flex items-center gap-1">
                  <input type="checkbox" checked={bulkFields.includes(f)} onChange={(e) => setBulkFields(e.target.checked ? [...bulkFields, f] : bulkFields.filter((x) => x !== f))} />
                  {DIFF_LABELS[f]}
                </label>
              ))}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-amber-900">Changes the live store now.</span>
                <button disabled={pending} onClick={confirming === "create" ? createTicked : updateTicked} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40">
                  {pending ? progress : `Yes, ${confirming} ${tickedHere.length}`}
                </button>
                <button disabled={pending} onClick={() => setConfirming(null)} className="rounded-md px-3 py-1.5 ring-1 ring-line">
                  Cancel
                </button>
              </>
            ) : (
              <button disabled={!tickedHere.length} onClick={() => setConfirming(filter === "new" ? "create" : "update")} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40">
                {filter === "new" ? `Create ${tickedHere.length} products on Shopify…` : `Update ${tickedHere.length} products on Shopify…`}
              </button>
            )}
          </div>
        </div>
      )}
      {progress && !pending && <p className="mb-3 text-sm text-emerald-900">{progress}</p>}
      {error && <p className="mb-3 rounded bg-rose-50 px-2 py-1 text-sm text-rose-900">{error}</p>}

      {!rows.length && <p className="text-sm text-muted">No works are Selected for {show?.name ?? "this show"} yet.</p>}
      {rows.length > 0 && !shown.length && <p className="text-sm text-muted">Nothing here.</p>}
      <div className="space-y-5">
        {groups.map(([artist, list]) => (
          <div key={artist}>
            <h3 className="mb-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-xl">{artist}</span>
              {list[0].artist && !list[0].artist.collectionOnShopify && (
                <Link href="/admin/shopify" className="text-xs text-amber-900 underline">
                  needs a collection first (Artists tab)
                </Link>
              )}
              {list[0].artist?.collectionOnShopify && list[0].artist.handle && (
                <a href={`${STORE}/collections/${list[0].artist.handle}`} target="_blank" rel="noreferrer" className="text-xs text-muted underline">
                  /collections/{list[0].artist.handle}
                </a>
              )}
            </h3>
            <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
              {list.map((r) => (
                <WorkRow key={r.id} r={r} showId={show!.id} tickable={tickable} ticked={ticked.has(r.id)} onTick={(v) => toggle(r.id, v)} result={results[r.id]} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkRow({ r, showId, tickable, ticked, onTick, result }: { r: Row; showId: string; tickable: boolean; ticked: boolean; onTick: (v: boolean) => void; result?: { ok: boolean; message: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<WorkUpdate[]>(r.diffs);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const note = msg ?? result ?? null;
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, message: okText } : { ok: false, message: res.error });
      if (res.ok) router.refresh();
    });

  return (
    <li className="p-3 text-sm">
      <div className="flex gap-3">
        {tickable && <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} className="mt-1 self-start" aria-label={`Tick ${r.title}`} />}
        <div className="w-16 shrink-0 overflow-hidden rounded">
          <ArtworkImage image={r.image ?? undefined} title={r.title} fallbackRatio={r.width && r.height ? r.width / r.height : null} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-muted">
            {[r.year, r.category, r.medium].filter(Boolean).join(" · ")} · {formatSize(r)} · {formatPrice(r.price)}
          </p>
          {r.product && (
            <p className="text-xs text-muted">
              Shopify:{" "}
              <a href={`${STORE}/products/${r.product.handle}`} target="_blank" rel="noreferrer" className="underline">
                /products/{r.product.handle}
              </a>{" "}
              · {r.product.sku ?? "no SKU"} · {r.product.status.toLowerCase()}
              {r.product.stock === 0 ? " · 0 in stock (sold?)" : ""}
            </p>
          )}
          {r.problems.length > 0 && r.state === "blocked" && (
            <div className="mt-1 flex flex-wrap gap-1">
              {r.problems.map((p) => (
                <span key={p} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 ring-1 ring-amber-200">
                  {p}
                </span>
              ))}
              {r.artist && (
                <Link href={`/admin/artists/${r.artist.id}`} className="text-[11px] underline">
                  fix on the artist page
                </Link>
              )}
            </div>
          )}
          {r.state === "link" && r.match && (
            <div className="mt-1 rounded bg-sky-50 p-2 text-xs ring-1 ring-sky-200">
              Shopify already has{" "}
              <a href={`${STORE}/products/${r.match.handle}`} target="_blank" rel="noreferrer" className="underline">
                {r.match.title}
              </a>{" "}
              ({r.match.vendor}, ${r.match.price}). Same work?{" "}
              <button disabled={pending} onClick={() => act(() => linkProductAction(r.id, r.match!.id), "Linked.")} className="ml-1 rounded bg-sky-900 px-2 py-0.5 text-white disabled:opacity-40">
                Yes, link it
              </button>
            </div>
          )}
          {r.state === "differs" && r.product && (
            <div className="mt-2 space-y-1">
              {r.diffs.map((d) => (
                <label key={d} className="flex flex-wrap items-center gap-2 text-xs">
                  <input type="checkbox" checked={fields.includes(d)} onChange={(e) => setFields(e.target.checked ? [...fields, d] : fields.filter((f) => f !== d))} />
                  <span className="font-medium">{DIFF_LABELS[d]}:</span>
                  {d === "title" && (
                    <span>
                      Shopify &ldquo;{r.product!.title}&rdquo; → portal &ldquo;{r.title}&rdquo;
                    </span>
                  )}
                  {d === "price" && (
                    <span>
                      Shopify ${r.product!.price} → portal {formatPrice(r.price)}
                    </span>
                  )}
                  {d === "vendor" && (
                    <span>
                      Shopify &ldquo;{r.product!.vendor}&rdquo; → portal &ldquo;{r.artist?.name}&rdquo;
                    </span>
                  )}
                  {d === "collection" && <span>add to /collections/{r.artist?.handle}</span>}
                  {d === "showTag" && <span>add to this show&rsquo;s collection</span>}
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={fields.includes("description")} onChange={(e) => setFields(e.target.checked ? [...fields, "description"] : fields.filter((f) => f !== "description"))} />
                Also rewrite the description from the portal (year, size, medium, artist&rsquo;s words)
              </label>
              <button disabled={pending || !fields.length} onClick={() => act(() => updateProductAction(r.id, showId, fields), "Updated on Shopify.")} className="rounded bg-ink px-2 py-1 text-xs text-white disabled:opacity-40">
                {pending ? "Updating…" : "Update this one"}
              </button>
            </div>
          )}
          {r.preview && (r.state === "new" || r.state === "blocked") && (
            <button onClick={() => setOpen(!open)} className="mt-1 text-xs underline">
              {open ? "Hide preview" : "Preview the product"}
            </button>
          )}
          {open && r.preview && (
            <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 rounded bg-paper p-2 text-xs">
              <dt className="text-muted">Title</dt>
              <dd>{r.preview.title}</dd>
              <dt className="text-muted">Vendor</dt>
              <dd>{r.preview.vendor}</dd>
              <dt className="text-muted">Type</dt>
              <dd>{r.preview.productType || "—"}</dd>
              <dt className="text-muted">Tags</dt>
              <dd>{r.preview.tags.join(", ")}</dd>
              <dt className="text-muted">Price</dt>
              <dd>{r.preview.price ? `$${r.preview.price}` : "—"} · 1 in stock · next ART number</dd>
              <dt className="text-muted">Collections</dt>
              <dd>/collections/{r.artist?.handle ?? "(artist's)"} + show + Artworks</dd>
              <dt className="text-muted">Description</dt>
              <dd dangerouslySetInnerHTML={{ __html: r.preview.descriptionHtml }} />
            </dl>
          )}
          {note && <p className={`mt-1 text-xs ${note.ok ? "text-emerald-800" : "text-rose-800"}`}>{note.message}</p>}
        </div>
      </div>
    </li>
  );
}
