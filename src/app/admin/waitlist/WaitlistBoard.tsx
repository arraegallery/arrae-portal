"use client";

import { useState, useTransition } from "react";
import { moveOnWaitlist, removeFromWaitlistAction, updateWaitlistEntry } from "../actions";
import { ArtworkImage, formatPrice } from "@/components/ArtworkImage";
import type { getWaitlist } from "@/lib/queries";

type Row = Awaited<ReturnType<typeof getWaitlist>>[number];

export function WaitlistBoard({ rows }: { rows: Row[] }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [medium, setMedium] = useState("");

  const shown = rows.filter((r) => !medium || r.works.some((w) => (w.medium ?? "").toLowerCase().includes(medium.toLowerCase())));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">Waitlist</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Ranked in the order you'd invite them when a spot opens. Artists only see “On our waitlist for a future opening”, never their rank or your notes.
          </p>
        </div>
        <input
          value={medium}
          onChange={(e) => setMedium(e.target.value)}
          placeholder="Fill a spot: filter by medium, e.g. ceramic"
          className="w-80 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line"
        />
      </section>

      <ol className="space-y-4">
        {shown.map((r) => (
          <li key={r.artistId} className={`rounded-lg bg-white p-4 ring-1 ring-line ${pending ? "opacity-80" : ""}`}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex w-10 flex-col items-center gap-1">
                <button aria-label="Move up" onClick={() => startTransition(() => moveOnWaitlist(r.artistId, "up"))} className="text-muted hover:text-ink">
                  ▲
                </button>
                <span className="font-display text-2xl">{r.rank}</span>
                <button aria-label="Move down" onClick={() => startTransition(() => moveOnWaitlist(r.artistId, "down"))} className="text-muted hover:text-ink">
                  ▼
                </button>
              </div>
              <div className="min-w-60 flex-1">
                <h2 className="font-display text-xl">{r.name}</h2>
                <p className="text-xs text-muted">
                  Waitlisted {r.since ? `since ${r.since}` : ""} {r.fromShow ? `from ${r.fromShow}` : ""}
                  {r.volumesWaited >= 2 && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">waiting {r.volumesWaited} Volumes</span>}
                </p>
                {editing === r.artistId ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditing(null);
                      startTransition(() => updateWaitlistEntry(r.artistId, { note: draft }));
                    }}
                  >
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 rounded-md px-2 py-1 text-sm ring-1 ring-line" />
                    <button className="rounded-md bg-ink px-3 text-sm text-white">Save</button>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setDraft(r.note ?? "");
                      setEditing(r.artistId);
                    }}
                    className="mt-2 block text-left text-sm text-muted hover:text-ink"
                  >
                    {r.note ? r.note : "+ Add a private note (why they're waiting, what you'd want)"}
                  </button>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      defaultChecked={r.carryForward}
                      onChange={(e) => startTransition(() => updateWaitlistEntry(r.artistId, { carryForward: e.target.checked }))}
                    />
                    Carry to next Volume
                  </label>
                  <button onClick={() => startTransition(() => removeFromWaitlistAction(r.artistId))} className="text-rose-700 hover:underline">
                    Remove from waitlist
                  </button>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {r.works.map((w) => (
                  <figure key={w.id} className="w-32 shrink-0">
                    <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-[#f3f0ea]">
                      <ArtworkImage
                        image={w.thumb ? { id: w.id, thumb: w.thumb, full: null, w: w.w, h: w.h } : undefined}
                        title={w.title}
                        fallbackRatio={w.width && w.height ? w.width / w.height : null}
                        className="max-h-32 w-auto object-contain"
                      />
                    </div>
                    <figcaption className="mt-1 truncate text-xs">{w.title}</figcaption>
                    <figcaption className="truncate text-xs text-muted">{formatPrice(w.price)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {shown.length === 0 && <p className="py-20 text-center text-muted">No one on the waitlist matches.</p>}
    </main>
  );
}
