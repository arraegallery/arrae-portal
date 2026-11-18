"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ShowClosing } from "@/lib/show-close";
import { markWorks } from "../../../logistics/actions";

const TZ = "America/New_York";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number | null) => (n === null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

export function CloseStep({ show, works, hasPickupWindow }: ShowClosing) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sold = works.filter((w) => w.sold);
  const goingHome = works.filter((w) => !w.sold);
  const back = goingHome.filter((w) => w.pickedUp).length;
  const total = sold.reduce((n, w) => n + (w.price ?? 0), 0);
  const tick = (ids: string[], done: boolean) =>
    start(async () => {
      setError(null);
      try {
        await markWorks(show.id, ids, "pickedUp", done);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 pb-24">
      <section className="mb-6 flex flex-wrap gap-3 text-sm">
        <Stat n={sold.length} label="sold" note={total ? money(total) : undefined} />
        <Stat n={goingHome.length} label="going back to artists" />
        <Stat n={back} label="picked up" note={`of ${goingHome.length}`} />
        <Link href="/admin/logistics" className="ml-auto self-center rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
          Pick-up times
        </Link>
      </section>
      {!hasPickupWindow && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          No pick-up times for {show.name} yet. When the show is near its end, add them under Pick-up times; artists then book a slot from their studio.
        </p>
      )}
      {error && <p className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}

      <h2 className="font-display text-2xl">Going back to artists</h2>
      <p className="mb-3 text-sm text-muted">Tick a work when the artist takes it home. Sold works come off this list on their own.</p>
      <ul className="divide-y divide-line rounded-xl bg-white ring-1 ring-line">
        {goingHome.map((w) => (
          <li key={w.id} className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {w.thumb ? <img src={w.thumb} alt="" className="h-12 w-12 rounded object-cover" /> : <span className="h-12 w-12 rounded bg-paper" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{w.title}</p>
              <p className="truncate text-xs text-muted">
                {w.artist}
                {w.pickup ? ` · pick-up ${when(w.pickup)}` : " · no pick-up booked"}
                {!w.received ? " · never marked dropped off" : ""}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={pending} checked={w.pickedUp} onChange={(e) => tick([w.id], e.target.checked)} />
              Picked up
            </label>
          </li>
        ))}
        {!goingHome.length && <li className="p-4 text-sm text-muted">Nothing to send back.</li>}
      </ul>

      <h2 className="mt-10 font-display text-2xl">Sold</h2>
      <p className="mb-3 text-sm text-muted">Marked sold from Shopify or on the work itself.</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {sold.map((w) => (
          <li key={w.id} className="overflow-hidden rounded-lg bg-white ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {w.thumb ? <img src={w.thumb} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] bg-paper" />}
            <div className="p-2 text-xs">
              <p className="truncate text-sm font-medium">{w.title}</p>
              <p className="truncate text-muted">
                {w.artist} · {money(w.price)}
              </p>
            </div>
          </li>
        ))}
        {!sold.length && <li className="text-sm text-muted">Nothing sold yet.</li>}
      </ul>
    </main>
  );
}

function Stat({ n, label, note }: { n: number; label: string; note?: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-2 ring-1 ring-line">
      <span className="font-display text-2xl">{n}</span> <span className="text-muted">{label}</span>
      {note && <span className="ml-1 text-xs text-muted">({note})</span>}
    </div>
  );
}
