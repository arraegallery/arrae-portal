"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ShowTabs } from "@/components/ShowTabs";
import { ShowPicker } from "@/components/ShowPicker";
import { addNote, addToSandbox, addWorksToShow, moveWorksToShow, reassignWorks, removeFromSandbox, removeWorksFromShow, requestBetterPhotos, setApplicationStatus, setWorkStatus } from "../../actions";

const PHOTO_NOTE = "Thank you for applying! Could you send us better photos of these works? Straight on, in good natural light, filling the frame, with no glare or background. A detail shot is welcome too.";
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
  shows,
  sameType,
  artists,
  focusArtist,
  focusWork,
}: {
  show: { id: string; name: string; type: string };
  entries: BoardEntry[];
  sandboxIds: string[];
  shows: { id: string; name: string }[];
  /** Other shows of the same kind, for the switcher next to the title. */
  sameType: { id: string; name: string }[];
  artists: { id: string; name: string; email: string }[];
  /** Opened from a link, such as the New page: show this artist's application or this work. */
  focusArtist?: string;
  focusWork?: string;
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
  const [openArtist, setOpenArtist] = useState<string | null>(() => (focusArtist && !focusWork && initial.some((e) => e.artist.id === focusArtist) ? focusArtist : null));
  const [openWork, setOpenWork] = useState<{ artistId: string; workId: string } | null>(() => {
    const e = focusWork ? initial.find((x) => x.works.some((w) => w.id === focusWork)) : undefined;
    return e && focusWork ? { artistId: e.artist.id, workId: focusWork } : null;
  });
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

  // Clicking the decision that is already chosen undoes it, back to "In review".
  function updateWork(artistId: string, workId: string, picked: WorkStatus) {
    const current = entries.find((e) => e.artist.id === artistId)?.works.find((w) => w.id === workId)?.status;
    const next: WorkStatus = current === picked ? "In review" : picked;
    setEntries((es) =>
      es.map((e) => (e.artist.id !== artistId ? e : { ...e, works: e.works.map((w) => (w.id === workId ? { ...w, status: next } : w)) })),
    );
    startTransition(() => setWorkStatus(show.id, workId, next));
  }
  function updateApplication(artistId: string, applicationId: string, picked: ApplicationStatus) {
    const current = entries.find((e) => e.artist.id === artistId)?.application?.status;
    const next: ApplicationStatus = current === picked ? "In review" : picked;
    setEntries((es) =>
      es.map((e) =>
        e.artist.id !== artistId || !e.application
          ? e
          : { ...e, application: { ...e.application, status: next }, onWaitlist: next === "Waitlist" ? true : e.onWaitlist },
      ),
    );
    startTransition(() => setApplicationStatus(applicationId, next));
  }

  function saveNote(artistId: string, body: string, workId?: string) {
    const text = body.trim();
    if (!text) return;
    const local = { id: -Date.now(), body: text, actor: "You", kind: "note", workId: workId ?? null, createdAt: new Date().toISOString() };
    setEntries((es) => es.map((e) => (e.artist.id === artistId ? { ...e, notes: [local, ...e.notes] } : e)));
    startTransition(() => addNote(artistId, text, show.id, workId));
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
      <section className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{show.type === "Takeover" ? "Takeovers" : "Reviews"}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl">{show.name}</h1>
            <ShowPicker current={show.id} shows={sameType} />
          </div>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted">Artists</dt>
            <dd className="text-xl" title="Everyone with an application or a work in this show">
              {entries.length}{" "}
              <span className="text-sm text-muted">
                ({entries.filter((e) => e.group === "New applicant").length} new, {entries.filter((e) => e.group === "Roster artist").length} roster)
              </span>
            </dd>
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
      <ShowTabs showId={show.id} active="review" sandboxCount={sandbox.size} />

      <section className="z-20 -mx-4 md:sticky md:top-[57px] mb-6 mt-4 flex flex-wrap items-center gap-2 border-y border-line bg-paper/95 px-4 py-2 text-sm backdrop-blur">
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
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-line">
          <option value="all">All media</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
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
              <p className="mt-1 text-xs text-muted">Chose the wrong one? Click it again to undo.</p>
            </div>
            <WorkShows
              key={`shows-${lightboxWork.id}`}
              workId={lightboxWork.id}
              showId={show.id}
              showName={show.name}
              shows={shows}
              onMoved={() => {
                setEntries((all) => all.map((e) => (e.artist.id === lightbox.artist.id ? { ...e, works: e.works.filter((w) => w.id !== lightboxWork.id) } : e)));
                setOpenWork(null);
              }}
            />
            <NotesBox
              key={lightboxWork.id}
              title="Internal notes on this work"
              notes={lightbox.notes.filter((n) => n.kind === "note" && n.workId === lightboxWork.id)}
              onAdd={(body) => saveNote(lightbox.artist.id, body, lightboxWork.id)}
            />
            <p className="mt-8 text-xs text-muted">Use ← → to move between works.</p>
          </aside>
        </div>
      )}

      {artist && <ArtistDrawer entry={artist} showId={show.id} showName={show.name} onClose={() => setOpenArtist(null)} onDecide={updateApplication} onAddNote={(body) => saveNote(artist.artist.id, body)} shows={shows} artists={artists} onOpenWork={(id) => setOpenWork({ artistId: artist.artist.id, workId: id })} />}
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
              {work.sold ? " · Sold" : ""}
            </p>
            {work.archived && <span className="mt-0.5 inline-block rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-line">Archived</span>}
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
  onAddNote,
  shows,
  artists,
  onOpenWork,
}: {
  entry: BoardEntry;
  showId: string;
  showName: string;
  onClose: () => void;
  onDecide: (artistId: string, applicationId: string, s: ApplicationStatus) => void;
  onAddNote: (body: string) => void;
  shows: { id: string; name: string }[];
  artists: { id: string; name: string; email: string }[];
  onOpenWork: (workId: string) => void;
}) {
  const a = entry.artist;
  const titleOf = new Map(entry.works.map((w) => [w.id, w.title]));
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="float-right text-muted">
          Close ✕
        </button>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{entry.group}</p>
        <h2 className="font-display text-3xl">{a.name}</h2>
        <a href={`/admin/artists/${a.id}`} className="text-sm underline">
          Open full profile to edit details, ARRAE bio and works →
        </a>
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
            <p className="mt-1 text-xs text-muted">Chose the wrong one? Click it again to undo.</p>
          </section>
        )}

        <NotesBox
          title="Internal notes"
          notes={entry.notes.filter((n) => n.kind === "note")}
          labelFor={(n) => (n.workId ? titleOf.get(n.workId) ?? "A work" : null)}
          onAdd={onAddNote}
        />

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

        <FixSubmission entry={entry} showId={showId} showName={showName} shows={shows} artists={artists} onDone={onClose} />

        {entry.notes.some((n) => n.kind !== "note") && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted">Decision history</summary>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {entry.notes
                .filter((n) => n.kind !== "note")
                .map((n) => (
                  <li key={n.id}>
                    <span className="text-xs">{new Date(n.createdAt).toLocaleDateString()} · </span>
                    {n.body}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </aside>
    </div>
  );
}

function NotesBox({
  title,
  notes,
  onAdd,
  labelFor,
}: {
  title: string;
  notes: BoardEntry["notes"];
  onAdd: (body: string) => void;
  labelFor?: (n: BoardEntry["notes"][number]) => string | null;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };
  return (
    <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-line">
      <h3 className="text-xs uppercase tracking-wider text-muted">{title}</h3>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Only ARRAE can see this. Artists never do."
        className="mt-2 h-20 w-full rounded-md bg-paper p-2 text-sm ring-1 ring-line"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted">⌘ + Enter to save</span>
        <button onClick={submit} disabled={!draft.trim()} className="rounded-md bg-ink px-3 py-1 text-sm text-white disabled:opacity-40">
          Save note
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
          {notes.map((n) => {
            const label = labelFor?.(n);
            return (
              <li key={n.id}>
                <p className="text-[11px] text-muted">
                  {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {label ? ` · on “${label}”` : ""}
                </p>
                <p className="whitespace-pre-line">{n.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** For submissions that landed in the wrong show, or under the wrong artist. */
function FixSubmission({
  entry,
  showId,
  showName,
  shows,
  artists,
  onDone,
}: {
  entry: BoardEntry;
  showId: string;
  showName: string;
  shows: { id: string; name: string }[];
  artists: { id: string; name: string; email: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(entry.works.map((w) => w.id)));
  const [mode, setMode] = useState<"move" | "artist" | "remove" | "photos">("move");
  const [photoNote, setPhotoNote] = useState(PHOTO_NOTE);
  const [toShow, setToShow] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [toArtist, setToArtist] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = [...picked];
  const allPicked = picked.size === entry.works.length;
  const matches = artistQuery.trim()
    ? artists.filter((a) => a.id !== entry.artist.id && (a.name + " " + a.email).toLowerCase().includes(artistQuery.trim().toLowerCase())).slice(0, 6)
    : [];

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-6 text-sm text-muted underline">
        Wrong show, wrong artist, or poor photos? Fix this submission
      </button>
    );

  const tab = (m: typeof mode, label: string) => (
    <button onClick={() => setMode(m)} className={`rounded-full px-2.5 py-1 text-xs ring-1 ${mode === m ? "bg-ink text-white ring-ink" : "ring-line"}`}>
      {label}
    </button>
  );

  return (
    <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-line">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-muted">Fix this submission</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-muted">
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">1. Which works? ({picked.size} of {entry.works.length})</p>
      <div className="mt-1 grid grid-cols-4 gap-2">
        {entry.works.map((w) => {
          const on = picked.has(w.id);
          return (
            <button
              key={w.id}
              onClick={() =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (n.has(w.id)) n.delete(w.id);
                  else n.add(w.id);
                  return n;
                })
              }
              className={`relative overflow-hidden rounded ring-2 ${on ? "ring-ink" : "ring-transparent opacity-50"}`}
              title={w.title}
            >
              <ArtworkImage image={w.images[0]} title={w.title} fallbackRatio={1} />
              {on && <span className="absolute right-1 top-1 rounded-full bg-ink px-1 text-[10px] text-white">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">2. What's wrong?</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {tab("move", "Belongs in another show")}
        {tab("artist", "Belongs to another artist")}
        {tab("remove", `Shouldn't be in ${showName}`)}
        {tab("photos", "Photos aren't good enough")}
      </div>

      {mode === "photos" && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-xs text-muted">
            This asks {entry.artist.name} for better photos of the works you picked, in your message thread and by email. They upload new ones from their studio. You can also
            replace photos yourself on{" "}
            <a href={`/admin/artists/${entry.artist.id}`} className="underline">
              their profile
            </a>
            .
          </p>
          <textarea value={photoNote} onChange={(e) => setPhotoNote(e.target.value)} className="h-24 w-full rounded-md p-2 ring-1 ring-line" />
          <button
            disabled={!ids.length || pending}
            onClick={() => run(() => requestBetterPhotos(ids, photoNote))}
            className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
          >
            {pending ? "Sending…" : `Ask for better photos of ${ids.length} work${ids.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {mode === "move" && (
        <div className="mt-3 space-y-2 text-sm">
          <select value={toShow} onChange={(e) => setToShow(e.target.value)} className="w-full rounded-md px-2 py-1.5 ring-1 ring-line">
            <option value="">Move to…</option>
            {shows
              .filter((x) => x.id !== showId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted">
            Decisions move with the works. {entry.application && allPicked ? "Their application moves too." : ""} If a work is already in that show, this just
            removes the extra copy here.
          </p>
          <button
            disabled={!toShow || !ids.length || pending}
            onClick={() => run(() => moveWorksToShow(showId, toShow, ids, allPicked ? entry.application?.id : undefined))}
            className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
          >
            {pending ? "Moving…" : `Move ${ids.length} work${ids.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {mode === "artist" && (
        <div className="mt-3 space-y-2 text-sm">
          <input
            value={artistQuery}
            onChange={(e) => {
              setArtistQuery(e.target.value);
              setToArtist(null);
            }}
            placeholder="Search existing artists by name or email"
            className="w-full rounded-md px-2 py-1.5 ring-1 ring-line"
          />
          {matches.length > 0 && !toArtist && (
            <ul className="rounded-md ring-1 ring-line">
              {matches.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      setToArtist(a.id);
                      setArtistQuery(a.name);
                    }}
                    className="block w-full px-2 py-1.5 text-left hover:bg-paper"
                  >
                    {a.name} <span className="text-xs text-muted">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!toArtist && (
            <div className="rounded-md bg-paper p-2">
              <p className="text-xs text-muted">Not here yet? Create the artist:</p>
              <div className="mt-1 flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="min-w-0 flex-1 rounded-md px-2 py-1.5 ring-1 ring-line" />
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" type="email" className="min-w-0 flex-1 rounded-md px-2 py-1.5 ring-1 ring-line" />
              </div>
            </div>
          )}
          <p className="text-xs text-muted">The works keep their decisions in every show. {entry.artist.name}'s record and application stay as they are.</p>
          <button
            disabled={!ids.length || pending || (!toArtist && !newName.trim())}
            onClick={() => run(() => reassignWorks(ids, toArtist ? { artistId: toArtist } : { name: newName, email: newEmail }))}
            className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
          >
            {pending ? "Moving…" : `Give ${ids.length} work${ids.length === 1 ? "" : "s"} to ${toArtist ? artistQuery : newName.trim() || "…"}`}
          </button>
        </div>
      )}

      {mode === "remove" && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-xs text-muted">The works stay in the artist's record and in any other show. They only leave {showName}.</p>
          <button
            disabled={!ids.length || pending}
            onClick={() => run(() => removeWorksFromShow(showId, ids))}
            className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
          >
            {pending ? "Removing…" : `Take ${ids.length} work${ids.length === 1 ? "" : "s"} out of ${showName}`}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}

/** Move one work to another show, or add it to another show as well (shown in more than one). */
function WorkShows({ workId, showId, showName, shows, onMoved }: { workId: string; showId: string; showName: string; shows: { id: string; name: string }[]; onMoved: () => void }) {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const others = shows.filter((x) => x.id !== showId);
  const go = (keep: boolean) =>
    start(async () => {
      setMsg(null);
      const name = shows.find((x) => x.id === to)?.name ?? to;
      try {
        if (keep) {
          await addWorksToShow([workId], to);
          setMsg({ ok: true, text: `Added to ${name}. It stays in ${showName} too.` });
          setTo("");
        } else {
          await moveWorksToShow(showId, to, [workId]);
          onMoved();
        }
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">Show</p>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line">
        <option value="">Choose another show…</option>
        {others.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <div className="mt-2 flex flex-wrap gap-2">
        <button disabled={!to || pending} onClick={() => go(false)} className="rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-40">
          Move it there
        </button>
        <button disabled={!to || pending} onClick={() => go(true)} className="rounded-md px-3 py-1.5 text-sm ring-1 ring-line disabled:opacity-40">
          Add it there too
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Move takes it out of {showName} and keeps its decision. Add keeps it here and puts it in the other show as well.</p>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-800" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
