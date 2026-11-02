"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { getShopifyCheck } from "@/lib/shopify-check";
import { setShopifyChecked } from "./actions";

type Data = Awaited<ReturnType<typeof getShopifyCheck>>;
type Row = Data["rows"][number];

export function ShopifyCheck({ shows, show, rows }: Data) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "issues" | "ready" | "checked">("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const issues = rows.filter((r) => r.issues.length);
  const ready = rows.filter((r) => !r.issues.length && !r.checked);
  const checked = rows.filter((r) => r.checked);
  const shown = filter === "issues" ? issues : filter === "ready" ? ready : filter === "checked" ? checked : rows;
  const tab = (v: typeof filter, label: string, n: number) => (
    <button onClick={() => setFilter(v)} className={`rounded-full px-3 py-1 text-sm ring-1 ${filter === v ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
      {label} ({n})
    </button>
  );
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Shopify check-over</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every selected work for a show, with what Shopify needs: photo, title, price, size, medium, year, and the artist&rsquo;s bio and collection. Fix anything flagged on the artist&rsquo;s
          profile, then tick each work once it looks right.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={show?.id ?? ""} onChange={(e) => router.push(`/admin/shopify?show=${encodeURIComponent(e.target.value)}`)} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line">
            {shows.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {tab("all", "All selected", rows.length)}
          {tab("issues", "Needs fixing", issues.length)}
          {tab("ready", "Ready to check", ready.length)}
          {tab("checked", "Checked", checked.length)}
          {ready.length > 0 && (
            <button disabled={pending} onClick={() => run(() => setShopifyChecked(ready.map((r) => r.id), true))} className="ml-auto rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-40">
              Tick all {ready.length} ready works
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </section>

      {!rows.length ? (
        <p className="text-sm text-muted">No works are marked Selected for {show?.name ?? "this show"} yet. Works show up here once you select them on the review board.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {shown.map((r) => (
            <CheckRow key={r.id} r={r} pending={pending} onCheck={(v) => run(() => setShopifyChecked([r.id], v))} />
          ))}
          {!shown.length && <li className="p-4 text-sm text-muted">Nothing here.</li>}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted">
        Sending checked works to Shopify as products needs a Shopify Admin connection. Once that&rsquo;s set up, a &ldquo;Push to Shopify&rdquo; button will appear here for checked works.
      </p>
    </main>
  );
}

function CheckRow({ r, pending, onCheck }: { r: Row; pending: boolean; onCheck: (v: boolean) => void }) {
  return (
    <li className="flex gap-4 p-3">
      <div className="w-20 shrink-0 overflow-hidden rounded">
        <ArtworkImage image={r.image ?? undefined} title={r.title} fallbackRatio={r.width && r.height ? r.width / r.height : null} />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-medium">{r.title}</p>
          {r.artist && (
            <Link href={`/admin/artists/${r.artist.id}`} className="text-muted hover:underline">
              {r.artist.name}
            </Link>
          )}
        </div>
        <p className="text-xs text-muted">
          {[r.year, r.medium].filter(Boolean).join(" · ")}
          {r.year || r.medium ? " · " : ""}
          {formatSize(r)} · {formatPrice(r.price)} · {r.photos} photo{r.photos === 1 ? "" : "s"}
          {r.artist?.collection ? ` · collection: ${r.artist.collection}` : ""}
          {r.received ? " · In the gallery" : ""}
          {r.onShopify ? " · On Shopify" : ""}
        </p>
        {r.issues.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.issues.map((i) => (
              <span key={i.key} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 ring-1 ring-amber-200">
                {i.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <label className={`flex shrink-0 cursor-pointer items-center gap-2 self-center rounded-md px-3 py-1.5 text-sm ring-1 ${r.checked ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "ring-line"}`}>
        <input type="checkbox" disabled={pending} checked={r.checked} onChange={(e) => onCheck(e.target.checked)} />
        {r.checked ? "Checked" : "Looks right"}
      </label>
    </li>
  );
}
