"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addToSandbox, createShow, promoteFromSandbox, removeFromSandbox, reorderSandbox, setSandboxNote } from "../../actions";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { SandboxWork } from "@/lib/queries";
import { STATUS_TONE } from "@/lib/status";
import { ShowTabs } from "@/components/ShowTabs";

type Show = { id: string; name: string; type: string };
type Source = "all" | "show" | "waitlist" | "roster";
const PAGE = 120;
const DECIDED = ["Shortlist", "Selected", "Waitlist", "Not included", "Unavailable"];

export function SandboxBoard({
  show,
  shows,
  sandbox: initialSandbox,
  works,
}: {
  show: Show;
  shows: Show[];
  sandbox: { workId: string; note: string | null }[];
  works: SandboxWork[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const byId = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);

  const [order, setOrder] = useState(initialSandbox.map((x) => x.workId));
  const [notes, setNotes] = useState(() => Object.fromEntries(initialSandbox.map((x) => [x.workId, x.note ?? ""])));
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  useEffect(() => {
    setOrder(initialSandbox.map((x) => x.workId));
    setStatusOverride({});
  }, [initialSandbox]);
  const inSandbox = new Set(order);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);

  // Picker filters
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("show");
  const [category, setCategory] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [hideSold, setHideSold] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const categories = useMemo(() => [...new Set(works.map((w) => w.category).filter(Boolean))].sort() as string[], [works]);

  const q = query.trim().toLowerCase();
  const pickable = works.filter(
    (w) =>
      !inSandbox.has(w.id) &&
      (source === "all" ||
        (source === "show" && w.showStatus !== null) ||
        (source === "waitlist" && w.onWaitlist) ||
        (source === "roster" && w.pastShows.length > 0)) &&
      (category === "all" || w.category === category) &&
      (!maxPrice || (w.price ?? 0) <= Number(maxPrice)) &&
      (!hideSold || (!w.sold && !w.archived)) &&
      (!q || w.artistName.toLowerCase().includes(q) || w.title.toLowerCase().includes(q) || (w.medium ?? "").toLowerCase().includes(q)),
  );

  const items = order.map((id) => byId.get(id)).filter((w): w is SandboxWork => !!w);
  const statusOf = (w: SandboxWork) => statusOverride[w.id] ?? w.showStatus;
  const total = items.reduce((sum, w) => sum + (w.price ?? 0), 0);
  const artistCount = new Set(items.map((w) => w.artistId)).size;
  const possible = items.filter((w) => statusOf(w) === "Shortlist" || statusOf(w) === "Selected").length;

  function add(id: string, at?: number) {
    if (inSandbox.has(id)) return;
    const next = [...order];
    next.splice(at ?? next.length, 0, id);
    setOrder(next);
    startTransition(async () => {
      await addToSandbox(show.id, id);
      if (at !== undefined) await reorderSandbox(show.id, next);
    });
  }
  function remove(id: string) {
    setOrder((o) => o.filter((x) => x !== id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    startTransition(() => removeFromSandbox(show.id, id));
  }
  function moveTo(id: string, targetId: string) {
    if (id === targetId) return;
    const next = order.filter((x) => x !== id);
    next.splice(next.indexOf(targetId), 0, id);
    setOrder(next);
    startTransition(() => reorderSandbox(show.id, next));
  }
  function promote(ids: string[]) {
    const eligible = ids.filter((id) => {
      const st = statusOf(byId.get(id)!);
      return !st || !DECIDED.includes(st);
    });
    if (!eligible.length) return;
    setStatusOverride((o) => ({ ...o, ...Object.fromEntries(eligible.map((id) => [id, "Shortlist"])) }));
    setSelected(new Set());
    startTransition(() => promoteFromSandbox(show.id, eligible));
  }
  function onDropAt(ev: React.DragEvent, targetId?: string) {
    ev.preventDefault();
    setDropHint(false);
    const id = ev.dataTransfer.getData("text/work") || dragging;
    setDragging(null);
    if (!id) return;
    if (inSandbox.has(id)) {
      if (targetId) moveTo(id, targetId);
      else {
        const next = [...order.filter((x) => x !== id), id];
        setOrder(next);
        startTransition(() => reorderSandbox(show.id, next));
      }
    } else add(id, targetId ? order.indexOf(targetId) : undefined);
  }

  const [newShowOpen, setNewShowOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"Volume" | "Takeover">("Volume");
  const [creating, startCreate] = useTransition();

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Sandbox · private to ARRAE</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl">{show.name}</h1>
            <select
              value={show.id}
              onChange={(e) => router.push(`/admin/sandbox/${e.target.value}`)}
              className="max-w-56 rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line"
              aria-label="Switch show"
            >
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button onClick={() => setNewShowOpen((v) => !v)} className="rounded-md bg-white px-2.5 py-1.5 text-sm ring-1 ring-line hover:bg-paper">
              + New show
            </button>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Play freely: drag works in, move them around, take them out. Nothing here is a decision. When you're happy, make works
            “possible choices”, and they join the <Link href={`/admin/review/${show.id}`} className="underline">{show.name} review board</Link> as
            Shortlist, ready to finalize.
          </p>
          {newShowOpen && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-line"
              onSubmit={(e) => {
                e.preventDefault();
                startCreate(async () => {
                  const id = await createShow(newName, newType);
                  router.push(`/admin/sandbox/${id}`);
                  setNewShowOpen(false);
                  setNewName("");
                });
              }}
            >
              <input
                autoFocus
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Volume V"
                className="w-64 rounded-md px-2 py-1.5 ring-1 ring-line"
              />
              <select value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} className="rounded-md px-2 py-1.5 ring-1 ring-line">
                <option>Volume</option>
                <option>Takeover</option>
              </select>
              <button disabled={creating} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-50">
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          )}
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted">In sandbox</dt>
            <dd className="text-xl">{items.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Artists</dt>
            <dd className="text-xl">{artistCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Total retail</dt>
            <dd className="text-xl">{formatPrice(total)}</dd>
          </div>
          <div>
            <dt className="text-muted">Possible choices</dt>
            <dd className="text-xl">{possible}</dd>
          </div>
        </dl>
      </section>

      <ShowTabs showId={show.id} active="sandbox" sandboxCount={items.length} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* The sandbox wall */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDropHint(true);
          }}
          onDragLeave={() => setDropHint(false)}
          onDrop={(e) => onDropAt(e)}
          className={`min-h-[60vh] rounded-xl border-2 border-dashed p-4 transition ${dropHint ? "border-ink/40 bg-[#ebe6dd]" : "border-[#d9d2c5] bg-[#f1ede6]"}`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{selected.size ? `${selected.size} selected` : "Tip: drag cards to reorder, or drag works in from the right."}</span>
            <div className="ml-auto flex gap-2">
              {selected.size > 0 && (
                <>
                  <button onClick={() => setSelected(new Set())} className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-line">
                    Clear
                  </button>
                  <button onClick={() => [...selected].forEach(remove)} className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-line">
                    Take out
                  </button>
                </>
              )}
              <button
                disabled={!items.length}
                onClick={() => promote(selected.size ? [...selected] : order)}
                className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
              >
                {selected.size ? `Make ${selected.size} possible choice${selected.size === 1 ? "" : "s"}` : "Make all possible choices"}
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="flex h-[50vh] flex-col items-center justify-center text-center text-muted">
              <p className="font-display text-2xl text-ink">An empty wall</p>
              <p className="mt-1 max-w-sm text-sm">Drag works here from the right, or click + on any of them. You can also add works from the review board.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((w) => {
                const st = statusOf(w);
                const isSel = selected.has(w.id);
                return (
                  <li
                    key={w.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/work", w.id);
                      setDragging(w.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      onDropAt(e, w.id);
                    }}
                    className={`group relative cursor-grab overflow-hidden rounded-lg bg-white ring-1 transition active:cursor-grabbing ${
                      isSel ? "ring-2 ring-ink" : "ring-line"
                    } ${dragging === w.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#f3f0ea]">
                      <ArtworkImage
                        image={w.image ?? undefined}
                        title={w.title}
                        fallbackRatio={w.width && w.height ? w.width / w.height : null}
                        className="max-h-full w-auto object-contain"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(w.id)) n.delete(w.id);
                          else n.add(w.id);
                          return n;
                        })
                      }
                      aria-label={isSel ? "Unselect" : "Select"}
                      className={`absolute left-2 top-2 h-6 w-6 rounded-full text-xs ring-1 ${isSel ? "bg-ink text-white ring-ink" : "bg-white/90 ring-line opacity-0 group-hover:opacity-100"}`}
                    >
                      {isSel ? "✓" : ""}
                    </button>
                    <button
                      onClick={() => remove(w.id)}
                      title="Take out of sandbox"
                      className="absolute right-2 top-2 h-6 w-6 rounded-full bg-white/90 text-sm text-muted ring-1 ring-line opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                    <div className="p-3 text-sm">
                      <p className="truncate text-xs text-muted">{w.artistName}</p>
                      <p className="truncate font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted">
                        {formatSize(w)} · {formatPrice(w.price)}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        {st && DECIDED.includes(st) ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[st]}`}>{st === "Shortlist" ? "Possible choice" : st}</span>
                        ) : (
                          <button onClick={() => promote([w.id])} className="rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-line hover:bg-paper">
                            Make possible choice
                          </button>
                        )}
                        <button
                          onClick={() => setOpenNote(openNote === w.id ? null : w.id)}
                          className={`ml-auto text-xs ${notes[w.id] ? "text-ink" : "text-muted"} hover:underline`}
                        >
                          {notes[w.id] ? "Note ✎" : "+ Note"}
                        </button>
                      </div>
                      {openNote === w.id && (
                        <textarea
                          autoFocus
                          value={notes[w.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [w.id]: e.target.value }))}
                          onBlur={() => startTransition(() => setSandboxNote(show.id, w.id, notes[w.id] ?? ""))}
                          placeholder="Why this one? Where would it hang?"
                          className="mt-2 h-20 w-full rounded-md p-2 text-xs ring-1 ring-line"
                        />
                      )}
                      {openNote !== w.id && notes[w.id] && <p className="mt-1 line-clamp-2 text-xs text-muted">{notes[w.id]}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Picker */}
        <aside className="rounded-xl bg-white p-4 ring-1 ring-line lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-90px)] lg:overflow-hidden lg:flex lg:flex-col">
          <h2 className="font-display text-xl">Add works</h2>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {(
              [
                ["show", `Submitted to ${show.name}`],
                ["waitlist", "Waitlist artists"],
                ["roster", "Shown before"],
                ["all", "Everything"],
              ] as [Source, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setSource(v);
                  setLimit(PAGE);
                }}
                className={`rounded-full px-2.5 py-1 ring-1 ${source === v ? "bg-ink text-white ring-ink" : "ring-line hover:bg-paper"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search artist, title, medium"
              className="min-w-0 flex-1 rounded-md px-2 py-1.5 ring-1 ring-line"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-32 rounded-md px-2 py-1.5 ring-1 ring-line">
              <option value="all">All media</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              inputMode="numeric"
              placeholder="Max $"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
              className="w-20 rounded-md px-2 py-1.5 ring-1 ring-line"
            />
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={hideSold} onChange={(e) => setHideSold(e.target.checked)} /> Hide sold &amp; archived
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">{pickable.length} works</p>
          <ul className="mt-2 grid auto-rows-max content-start grid-cols-3 gap-2 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1">
            {pickable.slice(0, limit).map((w) => (
              <li
                key={w.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/work", w.id);
                  setDragging(w.id);
                }}
                onDragEnd={() => setDragging(null)}
                className="group relative cursor-grab overflow-hidden rounded-md bg-paper ring-1 ring-line"
                title={`${w.artistName}, ${w.title}${w.pastShows.length ? ` · shown in ${w.pastShows.join(", ")}` : ""}`}
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#f3f0ea]">
                  <ArtworkImage image={w.image ?? undefined} title={w.title} fallbackRatio={w.width && w.height ? w.width / w.height : null} className="max-h-full w-auto object-contain" />
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[11px] text-muted">{w.artistName}</p>
                  <p className="truncate text-xs">{w.title}</p>
                  <p className="truncate text-[11px] text-muted">{formatPrice(w.price)}</p>
                </div>
                <button
                  onClick={() => add(w.id)}
                  aria-label={`Add ${w.title}`}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-ink text-sm text-white opacity-80 group-hover:opacity-100"
                >
                  +
                </button>
                {w.archived && <span className="absolute bottom-1 right-1 rounded bg-white px-1 text-[10px] text-muted ring-1 ring-line">Archived</span>}
                {w.onWaitlist && <span className="absolute left-1 top-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800 ring-1 ring-amber-200">Waitlist</span>}
              </li>
            ))}
          </ul>
          {pickable.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE)} className="mt-2 rounded-md py-1.5 text-sm ring-1 ring-line hover:bg-paper">
              Show more
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
