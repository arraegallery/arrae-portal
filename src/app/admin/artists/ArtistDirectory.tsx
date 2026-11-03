"use client";

import Link from "next/link";
import { useState } from "react";

type Row = { id: string; name: string; email: string; works: number; everSelected: boolean; hasArraeBio: boolean; lastSeen: string | null };

const seenFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function ArtistDirectory({ artists, owner }: { artists: Row[]; owner: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "roster" | "needs-bio">("all");
  const [bySeen, setBySeen] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = artists.filter(
    (a) =>
      (!needle || a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)) &&
      (filter === "all" || (filter === "roster" && a.everSelected) || (filter === "needs-bio" && a.everSelected && !a.hasArraeBio)),
  );
  if (bySeen) shown.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">{owner ? "Artists" : "Roster artists"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {owner && (
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
          <button onClick={() => setBySeen(!bySeen)} className={`rounded-full px-3 py-1 ring-1 ${bySeen ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`} title="Sort by the last time each artist signed in">
            Recently signed in
          </button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="w-60 rounded-md bg-white px-3 py-1.5 ring-1 ring-line" />
        </div>
      </section>
      <p className="mb-2 text-sm text-muted">{shown.length} artists</p>
      <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
        {shown.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/artists/${a.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
              <span className="font-display text-lg">{a.name}</span>
              <span className="truncate text-sm text-muted">{a.email}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{a.works} works</span>
              <span className="w-60 shrink-0 text-right text-xs text-muted" title="Last time this artist signed in to the portal" suppressHydrationWarning>
                {a.lastSeen ? `Last signed in ${seenFmt.format(new Date(a.lastSeen))}` : "Never signed in"}
              </span>
              {owner && a.everSelected && !a.hasArraeBio && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">Needs ARRAE bio</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
