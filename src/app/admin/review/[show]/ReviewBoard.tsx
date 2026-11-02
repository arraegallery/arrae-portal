"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { addNote, addToSandbox, removeFromSandbox, setApplicationStatus, setWorkStatus } from "../../actions";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { BoardEntry, BoardWork } from "@/lib/queries";
import {
  APPLICATION_STATUSES,
  STATUS_TONE,
  artistFacingApplication,
  artistFacingWork,
  type ApplicationStatus,
  type WorkStatus,
} from "@/lib/status";

type View = "artists" | "works";
type Group = "all" | "New applicant" | "Roster artist";
const WORK_DECISIONS: WorkStatus[] = ["Shortlist", "Selected", "Waitlist", "Not included"];
const OPEN: (ApplicationStatus | WorkStatus)[] = ["New", "Submitted", "In review", "Shortlist"];

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[status] ?? STATUS_TONE.New}`}>
      {status}
    </span>
  );
}

export function ReviewBoard({
  show,
  entries: initial,
  sandboxIds,
}: {
  show: { id: string; name: string; type: string };
  entries: BoardEntry[];
  sandboxIds: string[];
}) {
  const [entries, setEntries] = useState(initial);
  useEffect(() => setEntries(initial), [initial]);
  const [sandbox, setSandbox] = useState(() => new Set(sandboxIds));
  useEffect(() => setSandbox(new Set(sandboxIds)), [sandboxIds]);
  function toggleSandbox(workId: string) {
    const has = sandbox.has(workId);
    setSandbox((s) => {
      const n = new Set(s);
      if (has) n.delete(workId);
      else n.add(workId);
      return n;
    });
    startTransition(() => (has ? removeFromSandbox(show.id, workId) : addToSandbox(show.id, workId)));
  }
  const [view, setView] = useState<View>("artists");
  const [group, setGroup] = useState<Group>("all");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [query, setQuery] = useState("");
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [openWork, setOpenWork] = useState<{ artistId: string; workId: string } | null>(null);
  const [, startTransition] = useTransition();

  const categories = useMemo(
    () => [...new Set(entries.flatMap((e) => e.works.map((w) => w.category).filter(Boolean)))].sort() as string[],
    [entries],
  );

  const workPasses = (w: BoardWork) =>
    (status === "all" || (status === "open" ? OPEN.includes(w.status) : w.status === status)) &&
    (category === "all" || w.category === category) &&
    (!maxPrice || (w.price ?? 0) <= Number(maxPrice));

  const visible = entries
    .filter((e) => group === "all" || e.group === group)
    .filter((e) => !query || e.artist.name.toLowerCase().includes(query.toLowerCase()) || e.works.some((w) => w.title.toLowerCase().includes(query.toLowerCase())))
    .map((e) => ({ ...e, shown: e.works.filter(workPasses) }))
    .filter((e) => e.shown.length > 0 || (status !== "all" && e.application?.status === status));

  const allWorks = entries.flatMap((e) => e.works);
  const decided = allWorks.filter((w) => !OPEN.includes(w.status)).length;
  const selected = allWorks.filter((w) => w.status === "Selected").length;
  const artistsDecided = entries.filter((e) => e.application && !OPEN.includes(e.application.status)).length;
  const applicants = entries.filter((e) => e.application).length;

  function updateWork(artistId: string, workId: string, next: WorkStatus) {
    setEntries((es) =>
      es.map((e) => (e.artist.id !== artistId ? e : { ...e, works: e.works.map((w) => (w.id === workId ? { ...w, status: next } : w)) })),
    );
    startTransition(() => setWorkStatus(show.id, workId, next));
  }
  function updateApplication(artistId: string, applicationId: string, next: ApplicationStatus) {
    setEntries((es) =>
      es.map((e) =>
        e.artist.id !== artistId || !e.application
          ? e
          : { ...e, application: { ...e.application, status: next }, onWaitlist: next === "Waitlist" ? true : e.onWaitlist },
      ),
    );
    startTransition(() => setApplicationStatus(applicationId, next));
  }

  const artist = entries.find((e) => e.artist.id === openArtist) ?? null;
  const lightbox = openWork ? entries.find((e) => e.artist.id === openWork.artistId) : null;
  const lightboxWork = lightbox?.works.find((w) => w.id === openWork?.workId) ?? null;

  // Keyboard: arrows move through visible works in the lightbox, Escape closes.
  const flatVisible = visible.flatMap((e) => e.shown.map((w) => ({ artistId: e.artist.id, workId: w.id })));
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setOpenWork(null);
        setOpenArtist(null);
      }
      if (!openWork) return;
      const i = flatVisible.findIndex((x) => x.workId === openWork.workId);
      if (ev.key === "ArrowRight" && i < flatVisible.length - 1) setOpenWork(flatVisible[i + 1]);
      if (ev.key === "ArrowLeft" && i > 0) setOpenWork(flatVisible[i - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{show.type} review</p>
          <h1 className="font-display text-4xl">{show.name}</h1>
          <Link href={`/admin/sandbox/${show.id}`} className="text-sm text-muted underline">
            Open the {show.name} sandbox ({sandbox.size})
          </Link>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted">Artists</dt>
            <dd className="text-xl">{entries.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Applications decided</dt>
            <dd className="text-xl">
              {artistsDecided} <span className="text-sm text-muted">of {applicants}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Works decided</dt>
            <dd className="text-xl">
              {decided} <span className="text-sm text-muted">of {allWorks.length}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Selected</dt>
            <dd className="text-xl">{selected}</dd>
          </div>
        </dl>
      </section>

      <section className="z-20 -mx-4 md:sticky md:top-[57px] mb-6 flex flex-wrap items-center gap-2 border-y border-line bg-paper/95 px-4 py-2 text-sm backdrop-blur">
        <div className="flex rounded-md bg-white p-0.5 ring-1 ring-line">
          {(["artists", "works"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded px-3 py-1 ${view === v ? "bg-ink text-white" : ""}`}>
              {v === "artists" ? "By artist" : "All works"}
            </button>
          ))}
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-line">
          <option value="all">Everyone</option>
          <option value="New applicant">New applicants</option>
          <option value="Roster artist">Roster artists</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-line">
          <option value="all">Any status</option>
          <option value="open">Still to decide</option>
          {["Shortlist", "Selected", "Waitlist", "Not included"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-line">
          <option value="all">All media</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          inputMode="numeric"
          placeholder="Max price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
          className="w-28 rounded-md bg-white px-2 py-1.5 ring-1 ring-line"
        />
        <input
          placeholder="Search artist or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1 rounded-md bg-white px-2 py-1.5 ring-1 ring-line"
        />
        <span className="text-muted">{flatVisible.length} works</span>
      </section>

      {view === "artists" ? (
        <div className="space-y-10">
          {visible.map((e) => (
            <article key={e.artist.id} className="border-b border-line pb-8">
              <header className="mb-3 flex flex-wrap items-center gap-3">
                <button onClick={() => setOpenArtist(e.artist.id)} className="font-display text-2xl hover:underline">
                  {e.artist.name}
                </button>
                <span className="text-xs text-muted">{e.group}</span>
                {e.application && <Chip status={e.application.status} />}
                {e.onWaitlist && e.application?.status !== "Waitlist" && <Chip status="Waitlist" />}
                {e.application?.flag && <span className="text-xs text-amber-700">{e.application.flag}</span>}
                {e.application && (
                  <div className="ml-auto flex flex-wrap gap-1">
                    {(["Shortlist", "Selected", "Waitlist", "Request other works", "Not selected"] as ApplicationStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateApplication(e.artist.id, e.application!.id, s)}
                        className={`rounded-full px-2.5 py-1 text-xs ring-1 ${e.application!.status === s ? STATUS_TONE[s] + " font-medium" : "bg-white ring-line hover:bg-paper"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </header>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {e.shown.map((w) => (
                  <WorkCard key={w.id} work={w} onOpen={() => setOpenWork({ artistId: e.artist.id, workId: w.id })} onDecide={(s) => updateWork(e.artist.id, w.id, s)} inSandbox={sandbox.has(w.id)} onSandbox={() => toggleSandbox(w.id)} tall />
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
          {visible.flatMap((e) =>
            e.shown.map((w) => (
              <div key={w.id} className="mb-4 break-inside-avoid">
                <WorkCard work={w} artistName={e.artist.name} onOpen={() => setOpenWork({ artistId: e.artist.id, workId: w.id })} onDecide={(s) => updateWork(e.artist.id, w.id, s)} inSandbox={sandbox.has(w.id)} onSandbox={() => toggleSandbox(w.id)} />
              </div>
            )),
          )}
        </div>
      )}
      {visible.length === 0 && <p className="py-20 text-center text-muted">Nothing matches these filters.</p>}

      {lightbox && lightboxWork && (
        <div className="fixed inset-0 z-50 flex bg-black/85" onClick={() => setOpenWork(null)}>
          <div className="flex flex-1 items-center justify-center p-6" onClick={(ev) => ev.stopPropagation()}>
            <div className="max-h-full max-w-full overflow-auto">
              {lightboxWork.images.length ? (
                lightboxWork.images.map((img) => (
                  <div key={img.id} className="mb-4 max-w-[70vw]">
                    <ArtworkImage image={img} title={lightboxWork.title} size="full" className="max-h-[85vh] w-auto object-contain" />
                  </div>
                ))
              ) : (
                <div className="w-[50vw]">
                  <ArtworkImage title={lightboxWork.title} fallbackRatio={lightboxWork.width && lightboxWork.height ? lightboxWork.width / lightboxWork.height : null} />
                </div>
              )}
            </div>
          </div>
          <aside className="w-96 shrink-0 overflow-y-auto bg-paper p-6" onClick={(ev) => ev.stopPropagation()}>
            <button onClick={() => setOpenWork(null)} className="float-right text-muted">
              Close ✕
            </button>
            <button onClick={() => setOpenArtist(lightbox.artist.id)} className="text-sm text-muted hover:underline">
              {lightbox.artist.name}
            </button>
            <h2 className="font-display text-2xl">{lightboxWork.title}</h2>
            <p className="mt-1 text-sm text-muted">{[lightboxWork.year, lightboxWork.medium].filter(Boolean).join(" · ")}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Price</dt>
                <dd>{formatPrice(lightboxWork.price)}</dd>
              </div>
              <div>
                <dt className="text-muted">Size</dt>
                <dd>{formatSize(lightboxWork)}</dd>
                {lightboxWork.sizeConfidence !== "high" && lightboxWork.sizeAsEntered && (
                  <dd className="text-xs text-muted">Entered as “{lightboxWork.sizeAsEntered}”</dd>
                )}
              </div>
              <div>
                <dt className="text-muted">Medium</dt>
                <dd>{lightboxWork.category ?? "Not given"}</dd>
              </div>
              <div>
                <dt className="text-muted">Submitted</dt>
                <dd>{lightboxWork.submittedOn ?? "Unknown"}</dd>
              </div>
            </dl>
            {lightboxWork.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{lightboxWork.description}</p>}
            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted">Decision for {show.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {WORK_DECISIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateWork(lightbox.artist.id, lightboxWork.id, s)}
                    className={`rounded-full px-3 py-1.5 text-sm ring-1 ${lightboxWork.status === s ? STATUS_TONE[s] + " font-medium" : "bg-white ring-line"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Artist will see: “{artistFacingWork(lightboxWork.status, show.name)}”</p>
            </div>
            <p className="mt-8 text-xs text-muted">Use ← → to move between works.</p>
          </aside>
        </div>
      )}

      {artist && <ArtistDrawer entry={artist} showId={show.id} showName={show.name} onClose={() => setOpenArtist(null)} onDecide={updateApplication} onOpenWork={(id) => setOpenWork({ artistId: artist.artist.id, workId: id })} />}
    </main>
  );
}

function WorkCard({
  work,
  artistName,
  onOpen,
  onDecide,
  inSandbox,
  onSandbox,
  tall,
}: {
  work: BoardWork;
  artistName?: string;
  onOpen: () => void;
  onDecide: (s: WorkStatus) => void;
  inSandbox: boolean;
  onSandbox: () => void;
  tall?: boolean;
}) {
  const ratio = work.width && work.height ? work.width / work.height : null;
  return (
    <figure className={`group relative overflow-hidden rounded-lg bg-white ring-1 ring-line ${tall ? "w-80 shrink-0" : ""}`}>
      <button
        onClick={onSandbox}
        title={inSandbox ? "In your sandbox (click to take out)" : "Add to sandbox"}
        className={`absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs ring-1 transition ${
          inSandbox ? "bg-ink text-white ring-ink" : "bg-white/90 ring-line opacity-0 group-hover:opacity-100"
        }`}
      >
        {inSandbox ? "✓ Sandbox" : "+ Sandbox"}
      </button>
      <button onClick={onOpen} className="block w-full">
        <div className={tall ? "flex h-80 items-center justify-center bg-[#f3f0ea]" : ""}>
          <ArtworkImage image={work.images[0]} title={work.title} fallbackRatio={ratio} className={tall ? "max-h-80 w-auto object-contain" : ""} />
        </div>
      </button>
      <figcaption className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {artistName && <p className="truncate text-xs text-muted">{artistName}</p>}
            <p className="truncate font-medium">{work.title}</p>
            <p className="truncate text-xs text-muted">
              {formatSize(work)} · {formatPrice(work.price)}
            </p>
          </div>
          <Chip status={work.status} />
        </div>
        <div className="mt-2 flex gap-1 opacity-70 transition group-hover:opacity-100">
          {WORK_DECISIONS.map((s) => (
            <button
              key={s}
              onClick={() => onDecide(s)}
              title={s}
              className={`flex-1 rounded px-1 py-1 text-[11px] ring-1 ${work.status === s ? STATUS_TONE[s] : "bg-white ring-line hover:bg-paper"}`}
            >
              {s === "Not included" ? "No" : s}
            </button>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

function ArtistDrawer({
  entry,
  showId,
  showName,
  onClose,
  onDecide,
  onOpenWork,
}: {
  entry: BoardEntry;
  showId: string;
  showName: string;
  onClose: () => void;
  onDecide: (artistId: string, applicationId: string, s: ApplicationStatus) => void;
  onOpenWork: (workId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const a = entry.artist;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="float-right text-muted">
          Close ✕
        </button>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{entry.group}</p>
        <h2 className="font-display text-3xl">{a.name}</h2>
        <p className="mt-1 text-sm text-muted">
          <a href={`mailto:${a.email}`} className="hover:underline">
            {a.email}
          </a>
          {a.website && (
            <>
              {" · "}
              <a href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="hover:underline">
                Website
              </a>
            </>
          )}
          {a.social && <> · {a.social}</>}
        </p>

        {entry.application && (
          <section className="mt-5 rounded-lg bg-white p-4 ring-1 ring-line">
            <p className="text-xs uppercase tracking-wider text-muted">Application · submitted {entry.application.submittedOn}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {APPLICATION_STATUSES.filter((s) => s !== "Withdrawn").map((s) => (
                <button
                  key={s}
                  onClick={() => onDecide(a.id, entry.application!.id, s)}
                  className={`rounded-full px-2.5 py-1 text-xs ring-1 ${entry.application!.status === s ? STATUS_TONE[s] + " font-medium" : "bg-white ring-line"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Artist will see: “{artistFacingApplication(entry.application.status, showName)}”</p>
          </section>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {entry.works.map((w) => (
            <button key={w.id} onClick={() => onOpenWork(w.id)} className="overflow-hidden rounded ring-1 ring-line">
              <ArtworkImage image={w.images[0]} title={w.title} fallbackRatio={w.width && w.height ? w.width / w.height : null} />
            </button>
          ))}
        </div>

        {a.bio && (
          <section className="mt-6">
            <h3 className="text-xs uppercase tracking-wider text-muted">Bio / statement</h3>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{a.bio}</p>
          </section>
        )}
        {a.education && <p className="mt-3 text-sm">Education: {a.education}</p>}
        {a.internalNotes && (
          <section className="mt-6">
            <h3 className="text-xs uppercase tracking-wider text-muted">Notes from Airtable</h3>
            <p className="mt-1 whitespace-pre-line text-sm">{a.internalNotes}</p>
          </section>
        )}

        <section className="mt-6">
          <h3 className="text-xs uppercase tracking-wider text-muted">Private notes</h3>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const body = note;
              setNote("");
              startTransition(() => addNote(a.id, body, showId));
            }}
          >
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only you can see this" className="flex-1 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line" />
            <button disabled={pending || !note.trim()} className="rounded-md bg-ink px-3 text-sm text-white disabled:opacity-40">
              Add
            </button>
          </form>
          <ul className="mt-3 space-y-2 text-sm">
            {entry.notes.map((n) => (
              <li key={n.id} className={n.kind === "note" ? "" : "text-muted"}>
                <span className="text-xs text-muted">{new Date(n.createdAt).toLocaleDateString()} · </span>
                {n.body}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
