"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ShowTabs } from "@/components/ShowTabs";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import { addNote, setApplicationStatus, setWorkStatus } from "../../../actions";
import type { BoardEntry, BoardWork } from "@/lib/queries";
import { STATUS_TONE, artistFacingApplication, artistFacingWork, type ApplicationStatus, type WorkStatus } from "@/lib/status";

/**
 * The lists Anai sorts first-time applicants into. Each is just an application status from the
 * review board, with a plainer name, so nothing here is separate from the board or the waitlist.
 */
const LISTS = [
  { key: "review", label: "To review", statuses: ["New", "In review"], set: "In review", tone: "bg-sky-50 text-sky-900 ring-sky-200" },
  { key: "accept", label: "Accept", statuses: ["Selected"], set: "Selected", tone: STATUS_TONE.Selected },
  { key: "maybe", label: "Maybe", statuses: ["Shortlist"], set: "Shortlist", tone: STATUS_TONE.Shortlist },
  { key: "more", label: "Asked for other works", statuses: ["Request other works"], set: "Request other works", tone: STATUS_TONE["Request other works"] },
  { key: "waitlist", label: "Waitlist", statuses: ["Waitlist"], set: "Waitlist", tone: STATUS_TONE.Waitlist },
  { key: "decline", label: "Decline", statuses: ["Not selected"], set: "Not selected", tone: STATUS_TONE["Not selected"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ApplicationStatus[]; set: ApplicationStatus; tone: string }[];
type ListKey = (typeof LISTS)[number]["key"] | "all";

const listOf = (status: ApplicationStatus) => LISTS.find((l) => (l.statuses as readonly string[]).includes(status));

const WORK_PICKS: { status: WorkStatus; label: string }[] = [
  { status: "Selected", label: "Yes" },
  { status: "Shortlist", label: "Maybe" },
  { status: "Waitlist", label: "Waitlist" },
  { status: "Not included", label: "No" },
];

type Before = Record<string, { show: string; status: ApplicationStatus; submittedOn: string | null }[]>;

function fmtDate(d: string | null) {
  if (!d) return "date unknown";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function NewApplicants({
  show,
  entries: initial,
  before,
  sandboxCount,
  initialList,
  initialArtist,
}: {
  show: { id: string; name: string; type: string; open: boolean; deadline: string | null };
  entries: BoardEntry[];
  before: Before;
  sandboxCount: number;
  initialList?: string;
  initialArtist?: string;
}) {
  const [entries, setEntries] = useState(initial);
  useEffect(() => setEntries(initial), [initial]);
  const [list, setList] = useState<ListKey>(() =>
    initialList && (initialList === "all" || LISTS.some((l) => l.key === initialList)) ? (initialList as ListKey) : "review",
  );
  const [openId, setOpenId] = useState<string | null>(initialArtist ?? null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const detailRef = useRef<HTMLDivElement>(null);

  const count = (key: ListKey) => (key === "all" ? entries.length : entries.filter((e) => listOf(e.application!.status)?.key === key).length);
  const inList = useMemo(
    () =>
      entries
        .filter((e) => list === "all" || listOf(e.application!.status)?.key === list)
        .filter((e) => !query || e.artist.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => String(a.application!.submittedOn).localeCompare(String(b.application!.submittedOn)) || a.artist.name.localeCompare(b.artist.name)),
    [entries, list, query],
  );

  // Keep the address in step, so a list (or an applicant) can be bookmarked and pulled up again.
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("list", list);
    if (openId) u.searchParams.set("artist", openId);
    else u.searchParams.delete("artist");
    window.history.replaceState(null, "", u);
  }, [list, openId]);

  // Open the first applicant of the list when nothing (or someone from another list) is open, on wide screens.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    if (!openId || !entries.some((e) => e.artist.id === openId)) setOpenId(inList[0]?.artist.id ?? null);
  }, [inList, openId, entries]);

  const current = entries.find((e) => e.artist.id === openId) ?? null;
  const viewingWork = current?.works.find((w) => w.id === viewing) ?? null;

  function pickList(key: ListKey) {
    setList(key);
    setQuery("");
    const first = entries
      .filter((e) => key === "all" || listOf(e.application!.status)?.key === key)
      .sort((a, b) => String(a.application!.submittedOn).localeCompare(String(b.application!.submittedOn)) || a.artist.name.localeCompare(b.artist.name))[0];
    setOpenId(typeof window !== "undefined" && window.innerWidth < 1024 ? null : (first?.artist.id ?? null));
  }

  function moveTo(entry: BoardEntry, next: ApplicationStatus) {
    if (!entry.application || entry.application.status === next) return;
    // When the applicant leaves the list being worked through, go straight on to the next one.
    const idx = inList.findIndex((e) => e.artist.id === entry.artist.id);
    const leaves = list !== "all" && listOf(next)?.key !== list;
    const following = leaves ? (inList[idx + 1] ?? inList[idx - 1] ?? null) : entry;
    setEntries((es) => es.map((e) => (e.artist.id === entry.artist.id ? { ...e, application: { ...e.application!, status: next } } : e)));
    setOpenId(following ? following.artist.id : null);
    setViewing(null);
    detailRef.current?.scrollTo({ top: 0 });
    startTransition(() => setApplicationStatus(entry.application!.id, next));
  }

  function pickWork(entry: BoardEntry, workId: string, picked: WorkStatus) {
    const cur = entry.works.find((w) => w.id === workId)?.status;
    const next: WorkStatus = cur === picked ? "In review" : picked;
    setEntries((es) =>
      es.map((e) => (e.artist.id !== entry.artist.id ? e : { ...e, works: e.works.map((w) => (w.id === workId ? { ...w, status: next } : w)) })),
    );
    startTransition(() => setWorkStatus(show.id, workId, next));
  }

  function saveNote(entry: BoardEntry, body: string) {
    const text = body.trim();
    if (!text) return;
    const local = { id: -Date.now(), body: text, actor: "You", kind: "note", workId: null, createdAt: new Date().toISOString() };
    setEntries((es) => es.map((e) => (e.artist.id === entry.artist.id ? { ...e, notes: [local, ...e.notes] } : e)));
    startTransition(() => addNote(entry.artist.id, text, show.id));
  }

  // Escape closes the large view; arrows step through this artist's works.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (!viewing || !current) return;
      if (ev.key === "Escape") setViewing(null);
      const i = current.works.findIndex((w) => w.id === viewing);
      if (ev.key === "ArrowRight" && i < current.works.length - 1) setViewing(current.works[i + 1].id);
      if (ev.key === "ArrowLeft" && i > 0) setViewing(current.works[i - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, current]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Reviews</p>
          <h1 className="font-display text-4xl">{show.name}</h1>
        </div>
        <p className={`rounded-full px-3 py-1 text-sm ring-1 ${show.open ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-muted ring-line"}`}>
          {show.open ? "● Still taking applications" : `Applications closed${show.deadline ? ` (due ${fmtDate(show.deadline)})` : ""}`}
        </p>
      </section>
      <ShowTabs showId={show.id} active="new" sandboxCount={sandboxCount} newCount={entries.length} />

      <p className="mt-4 text-sm text-muted">
        Artists applying for the first time: never selected for a show before. Roster artists sending new work stay on the Review board.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Lists">
        {[...LISTS, { key: "all" as const, label: "Everyone", tone: "bg-ink text-white ring-ink" }].map((l) => (
          <button
            key={l.key}
            onClick={() => pickList(l.key)}
            aria-pressed={list === l.key}
            className={`rounded-full px-4 py-2 text-sm ring-1 transition ${list === l.key ? `${l.tone} font-medium ring-2` : "bg-white ring-line hover:bg-paper"}`}
          >
            {l.label} <span className="ml-1 tabular-nums opacity-70">{count(l.key)}</span>
          </button>
        ))}
      </nav>

      <div className="mt-5 grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* The list */}
        <aside className={`${current ? "hidden lg:block" : ""}`}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an applicant by name"
            className="mb-3 w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line"
          />
          {inList.length === 0 ? (
            <p className="rounded-lg bg-white p-6 text-center text-sm text-muted ring-1 ring-line">
              {list === "review" ? "Everyone has been sorted. Nice work." : "Nobody in this list yet."}
            </p>
          ) : (
            <ul className="space-y-2 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-1">
              {inList.map((e) => {
                const l = listOf(e.application!.status);
                const active = e.artist.id === openId;
                return (
                  <li key={e.artist.id}>
                    <button
                      onClick={() => {
                        setOpenId(e.artist.id);
                        setViewing(null);
                        detailRef.current?.scrollTo({ top: 0 });
                        window.scrollTo({ top: 0 });
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ring-1 transition ${active ? "bg-white ring-2 ring-ink" : "bg-white ring-line hover:ring-ink/40"}`}
                    >
                      <div className="flex shrink-0 gap-1">
                        {e.works.slice(0, 3).map((w) => (
                          <div key={w.id} className="h-14 w-14 overflow-hidden rounded bg-[#f3f0ea]">
                            <ArtworkImage image={w.images[0]} title={w.title} className="h-14 w-14 object-cover" />
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.artist.name}</p>
                        <p className="truncate text-xs text-muted">
                          {e.works.length} work{e.works.length === 1 ? "" : "s"} · {fmtDate(e.application!.submittedOn)}
                        </p>
                        {list === "all" && l && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ring-1 ${l.tone}`}>{l.label}</span>}
                        {before[e.artist.id]?.length ? <span className="ml-1 mt-1 inline-block text-[11px] text-muted">Applied before</span> : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* The applicant */}
        <div ref={detailRef} className={current ? "" : "hidden lg:block"}>
          {current ? (
            <Applicant
              key={current.artist.id}
              entry={current}
              showName={show.name}
              before={before[current.artist.id] ?? []}
              position={inList.findIndex((e) => e.artist.id === current.artist.id)}
              total={inList.length}
              onBack={() => setOpenId(null)}
              onStep={(d) => {
                const i = inList.findIndex((e) => e.artist.id === current.artist.id);
                const next = inList[i + d];
                if (next) setOpenId(next.artist.id);
              }}
              onMove={(s) => moveTo(current, s)}
              onOpenWork={setViewing}
              onPickWork={(id, s) => pickWork(current, id, s)}
              onNote={(b) => saveNote(current, b)}
            />
          ) : (
            <p className="rounded-lg bg-white p-10 text-center text-muted ring-1 ring-line">Pick an applicant on the left to see their bio and works.</p>
          )}
        </div>
      </div>

      {current && viewingWork && (
        <LargeWork
          work={viewingWork}
          artistName={current.artist.name}
          showName={show.name}
          index={current.works.findIndex((w) => w.id === viewingWork.id)}
          total={current.works.length}
          onStep={(d) => {
            const i = current.works.findIndex((w) => w.id === viewingWork.id);
            const n = current.works[i + d];
            if (n) setViewing(n.id);
          }}
          onPick={(s) => pickWork(current, viewingWork.id, s)}
          onClose={() => setViewing(null)}
        />
      )}
    </main>
  );
}

function Applicant({
  entry,
  showName,
  before,
  position,
  total,
  onBack,
  onStep,
  onMove,
  onOpenWork,
  onPickWork,
  onNote,
}: {
  entry: BoardEntry;
  showName: string;
  before: Before[string];
  position: number;
  total: number;
  onBack: () => void;
  onStep: (d: 1 | -1) => void;
  onMove: (s: ApplicationStatus) => void;
  onOpenWork: (id: string) => void;
  onPickWork: (id: string, s: WorkStatus) => void;
  onNote: (body: string) => void;
}) {
  const a = entry.artist;
  const app = entry.application!;
  const here = listOf(app.status);
  const [draft, setDraft] = useState("");
  const notes = entry.notes.filter((n) => n.kind === "note");
  const site = a.website ? (a.website.startsWith("http") ? a.website : `https://${a.website}`) : null;
  return (
    <article className="rounded-xl bg-white p-5 ring-1 ring-line md:p-7">
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <button onClick={onBack} className="hover:underline lg:hidden">
          ← Back to the list
        </button>
        {position >= 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => onStep(-1)} disabled={position <= 0} className="rounded px-2 py-1 ring-1 ring-line disabled:opacity-30">
              ← Previous
            </button>
            <span className="tabular-nums">
              {position + 1} of {total}
            </span>
            <button onClick={() => onStep(1)} disabled={position >= total - 1} className="rounded px-2 py-1 ring-1 ring-line disabled:opacity-30">
              Next →
            </button>
          </div>
        )}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-4xl leading-tight">{a.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Applied {fmtDate(app.submittedOn)} ·{" "}
            <a href={`mailto:${a.email}`} className="hover:underline">
              {a.email}
            </a>
            {site && (
              <>
                {" · "}
                <a href={site} target="_blank" rel="noreferrer" className="underline">
                  Website
                </a>
              </>
            )}
            {a.social && <> · {a.social}</>}
          </p>
        </div>
        {here && <span className={`rounded-full px-3 py-1 text-sm ring-1 ${here.tone}`}>In: {here.label}</span>}
      </header>

      <section className="mt-5 rounded-lg bg-paper p-4 ring-1 ring-line">
        <p className="text-xs uppercase tracking-wider text-muted">Move to a list</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LISTS.map((l) => {
            const on = here?.key === l.key;
            return (
              <button
                key={l.key}
                onClick={() => onMove(l.set)}
                disabled={on}
                className={`rounded-full px-4 py-2 text-sm ring-1 transition ${on ? `${l.tone} font-medium ring-2` : "bg-white ring-line hover:ring-ink/50"}`}
              >
                {on ? "✓ " : ""}
                {l.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Artist will see “{artistFacingApplication(app.status, showName)}” once you release decisions on the Shows page. Waitlist also adds them to the
          Waitlist page.
        </p>
      </section>

      <section className="mt-6">
        <h3 className="text-xs uppercase tracking-wider text-muted">Works they applied with · click one to see it large</h3>
        {entry.works.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No works attached to this application.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {entry.works.map((w) => (
              <figure key={w.id} className="overflow-hidden rounded-lg ring-1 ring-line">
                <button onClick={() => onOpenWork(w.id)} className="flex h-64 w-full items-center justify-center bg-[#f3f0ea]" title="Open large">
                  <ArtworkImage image={w.images[0]} title={w.title} fallbackRatio={w.width && w.height ? w.width / w.height : null} className="max-h-64 w-auto object-contain" />
                </button>
                <figcaption className="p-3">
                  <p className="truncate font-medium">{w.title}</p>
                  <p className="truncate text-xs text-muted">
                    {[w.medium, formatSize(w), formatPrice(w.price)].filter(Boolean).join(" · ")}
                  </p>
                  <WorkPicks status={w.status} onPick={(s) => onPickWork(w.id, s)} />
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="mt-7 grid gap-6 md:grid-cols-[1fr_300px]">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted">Bio / statement</h3>
          {a.bio ? <p className="mt-1 whitespace-pre-line leading-relaxed">{a.bio}</p> : <p className="mt-1 text-sm text-muted">No bio given.</p>}
          {a.education && (
            <>
              <h3 className="mt-5 text-xs uppercase tracking-wider text-muted">Education</h3>
              <p className="mt-1 whitespace-pre-line text-sm">{a.education}</p>
            </>
          )}
          {a.internalNotes && (
            <>
              <h3 className="mt-5 text-xs uppercase tracking-wider text-muted">Notes from Airtable</h3>
              <p className="mt-1 whitespace-pre-line text-sm">{a.internalNotes}</p>
            </>
          )}
          <a href={`/admin/artists/${a.id}`} className="mt-5 inline-block text-sm underline">
            Open their full artist page →
          </a>
        </div>
        <div className="space-y-4">
          {before.length > 0 && (
            <div className="rounded-lg bg-paper p-3 text-sm ring-1 ring-line">
              <p className="text-xs uppercase tracking-wider text-muted">Applied before</p>
              <ul className="mt-1 space-y-1">
                {before.map((b, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{b.show}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATUS_TONE[b.status] ?? "ring-line"}`}>{b.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg bg-paper p-3 ring-1 ring-line">
            <p className="text-xs uppercase tracking-wider text-muted">Your notes (private)</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Only ARRAE sees this."
              className="mt-2 h-20 w-full rounded-md bg-white p-2 text-sm ring-1 ring-line"
            />
            <button
              onClick={() => {
                onNote(draft);
                setDraft("");
              }}
              disabled={!draft.trim()}
              className="mt-1 rounded-md bg-ink px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              Save note
            </button>
            {notes.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-2 text-sm">
                {notes.map((n) => (
                  <li key={n.id}>
                    <p className="text-[11px] text-muted">{new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                    <p className="whitespace-pre-line">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}

function WorkPicks({ status, onPick }: { status: WorkStatus; onPick: (s: WorkStatus) => void }) {
  return (
    <div className="mt-2 flex gap-1">
      {WORK_PICKS.map((p) => (
        <button
          key={p.status}
          onClick={() => onPick(p.status)}
          title={status === p.status ? "Click again to undo" : `Mark this work ${p.label}`}
          className={`flex-1 rounded px-1 py-1 text-xs ring-1 ${status === p.status ? STATUS_TONE[p.status] + " font-medium" : "bg-white ring-line hover:bg-paper"}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** A work opened large: every photo, with its details beside it. Esc, ✕ or a click outside closes it. */
function LargeWork({
  work,
  artistName,
  showName,
  index,
  total,
  onStep,
  onPick,
  onClose,
}: {
  work: BoardWork;
  artistName: string;
  showName: string;
  index: number;
  total: number;
  onStep: (d: 1 | -1) => void;
  onPick: (s: WorkStatus) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  const ratio = work.width && work.height ? work.width / work.height : null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 md:flex-row" onClick={onClose}>
      <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 md:items-center md:p-6">
        <div className="max-w-full" onClick={(e) => e.stopPropagation()}>
          {work.images.length ? (
            work.images.map((img) => (
              <div key={img.id} className="mx-auto mb-4 max-w-[90vw] md:max-w-[60vw]">
                <ArtworkImage image={img} title={work.title} size="full" className="max-h-[85vh] w-auto object-contain" />
              </div>
            ))
          ) : (
            <div className="w-[80vw] md:w-[40vw]">
              <ArtworkImage title={work.title} fallbackRatio={ratio} />
            </div>
          )}
        </div>
      </div>
      <aside className="max-h-[50vh] w-full shrink-0 overflow-y-auto bg-paper p-5 md:max-h-none md:w-96 md:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="float-right text-sm text-muted">
          Close ✕
        </button>
        <p className="text-sm text-muted">{artistName}</p>
        <h2 className="font-display text-2xl">{work.title}</h2>
        <p className="mt-1 text-sm text-muted">{[work.year, work.medium].filter(Boolean).join(" · ")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Price</dt>
            <dd>{formatPrice(work.price)}</dd>
          </div>
          <div>
            <dt className="text-muted">Size</dt>
            <dd>{formatSize(work)}</dd>
            {work.sizeAsEntered && work.width && work.height && <dd className="text-xs text-muted">Entered as “{work.sizeAsEntered}”</dd>}
          </div>
          <div>
            <dt className="text-muted">Category</dt>
            <dd>{work.category ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-muted">Photos</dt>
            <dd>{work.images.length || "None yet"}</dd>
          </div>
        </dl>
        {work.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{work.description}</p>}
        <div className="mt-6">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">This work for {showName}</p>
          <WorkPicks status={work.status} onPick={onPick} />
          <p className="mt-2 text-xs text-muted">Artist will see “{artistFacingWork(work.status, showName)}”. Click a choice again to undo.</p>
        </div>
        {total > 1 && (
          <div className="mt-8 flex items-center justify-between text-sm">
            <button onClick={() => onStep(-1)} disabled={index <= 0} className="rounded px-3 py-1.5 ring-1 ring-line disabled:opacity-30">
              ← Previous work
            </button>
            <span className="text-muted">
              {index + 1} of {total}
            </span>
            <button onClick={() => onStep(1)} disabled={index >= total - 1} className="rounded px-3 py-1.5 ring-1 ring-line disabled:opacity-30">
              Next work →
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
