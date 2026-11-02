"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fillBiosFromShopify } from "../actions";

type Row = { id: string; name: string; email: string; works: number; everSelected: boolean; hasArraeBio: boolean };

export function ArtistDirectory({ artists, owner }: { artists: Row[]; owner: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "roster" | "needs-bio">("all");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fill = () =>
    start(async () => {
      setResult(null);
      try {
        const r = await fillBiosFromShopify();
        const parts = [
          r.filled.length ? `Filled ${r.filled.length} ARRAE bio${r.filled.length === 1 ? "" : "s"} from Shopify: ${r.filled.join(", ")}.` : "No empty ARRAE bios had a matching Shopify collection.",
          r.kept ? `${r.kept} already had a bio and were left alone.` : "",
          r.unmatched.length ? `Collections with no matching artist: ${r.unmatched.join(", ")}.` : "",
        ];
        setResult({ ok: true, text: parts.filter(Boolean).join(" ") });
        router.refresh();
      } catch (e) {
        setResult({ ok: false, text: (e as Error).message });
      }
    });
  const needle = q.trim().toLowerCase();
  const shown = artists.filter(
    (a) =>
      (!needle || a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)) &&
      (filter === "all" || (filter === "roster" && a.everSelected) || (filter === "needs-bio" && a.everSelected && !a.hasArraeBio)),
  );
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">Artists</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ["all", "Everyone"],
              ["roster", "Ever selected"],
              ["needs-bio", "Selected, no ARRAE bio yet"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-3 py-1 ring-1 ${filter === v ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
              {label}
            </button>
          ))}
          {owner && (
            <button onClick={fill} disabled={pending} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line disabled:opacity-50" title="Copies each artist collection's description from arraegallery.com into ARRAE bios that are still empty">
              {pending ? "Filling…" : "Fill bios from Shopify"}
            </button>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="w-60 rounded-md bg-white px-3 py-1.5 ring-1 ring-line" />
        </div>
      </section>
      {result && <p className={`mb-3 rounded-md p-3 text-sm ring-1 ${result.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{result.text}</p>}
      <p className="mb-2 text-sm text-muted">{shown.length} artists</p>
      <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
        {shown.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/artists/${a.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
              <span className="font-display text-lg">{a.name}</span>
              <span className="truncate text-sm text-muted">{a.email}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{a.works} works</span>
              {a.everSelected && !a.hasArraeBio && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">Needs ARRAE bio</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
