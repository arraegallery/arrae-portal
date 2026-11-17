"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { acceptArtistForShow, finalizeSandbox, sandboxWorkDetails, updateWork } from "../../actions";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import { CATEGORIES } from "@/lib/application-fields";
import { finalizeConflicts } from "@/lib/finalize";
import type { SandboxWork } from "@/lib/queries";
import { STATUS_TONE } from "@/lib/status";
import { FLOOR } from "@/lib/walls";
import { IN_TRAY, type WallMover } from "./ScaleWall";

function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full rounded-xl bg-white p-5 shadow-xl ring-1 ring-line ${wide ? "max-w-5xl" : "max-w-2xl"}`}
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 h-8 w-8 rounded-full text-xl text-muted hover:bg-paper">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

/** The work never belongs to an artist whose first show this is unless they're accepted for it. */
export function needsAcceptance(w: SandboxWork) {
  return w.artistKind === "new" && w.application?.status !== "Selected";
}

/**
 * Finalize: every work in the sandbox becomes Selected for the show, and first-time artists in it are
 * accepted. They're listed here (each can still be accepted on its own with the button).
 */
export function FinalizePanel({
  show,
  items,
  missing,
  onClose,
}: {
  show: { id: string; name: string };
  items: SandboxWork[];
  missing: MissingArtist[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const conflicts = finalizeConflicts(items);
  // Every first-time artist in the sandbox, wherever their works sit (walls or the floor box).
  const firstTime = [...new Map(items.filter((w) => w.artistKind === "new" && w.artistId).map((w) => [w.artistId!, w])).values()]
    .map((w) => ({
      artistId: w.artistId!,
      artistName: w.artistName,
      accepted: w.application?.status === "Selected",
      application: w.application,
      works: items.filter((x) => x.artistId === w.artistId),
    }))
    .sort((a, b) => Number(a.accepted) - Number(b.accepted) || a.artistName.localeCompare(b.artistName));
  const soldOrArchived = items.filter((w) => w.sold || w.archived);
  const artists = new Set(items.map((w) => w.artistId)).size;
  const total = items.reduce((s, w) => s + (w.price ?? 0), 0);

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl">Finalize {show.name}</h2>
      {done !== null ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200">
            Done. {done} work{done === 1 ? " is" : "s are"} now Selected for {show.name}.
          </p>
          <p className="text-muted">
            Artists don&apos;t see anything yet. Next, send the welcome emails: they release the decisions and invite each artist to book their drop-off.
          </p>
          <div className="flex gap-2">
            <Link href={`/admin/shows/${show.id}/notify`} className="rounded-md bg-ink px-3 py-1.5 text-white">
              Next: notify artists
            </Link>
            <button onClick={onClose} className="rounded-md px-3 py-1.5 ring-1 ring-line">
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-4 text-sm">
          <p className="text-muted">
            Every work in this sandbox ({items.length} works by {artists} artist{artists === 1 ? "" : "s"}, {formatPrice(total)} retail) becomes{" "}
            <b>Selected</b> for {show.name}. The sandbox is the final word: any other work marked Selected for {show.name} becomes{" "}
            <b>Not included</b>, and first-time artists here are accepted. Artists see nothing until you release decisions.
          </p>

          {firstTime.length > 0 && (
            <section className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <h3 className="font-medium text-emerald-900">
                {firstTime.length} first-time artist{firstTime.length === 1 ? "" : "s"} in this sandbox
                {conflicts.length > 0 ? ` (${conflicts.length} will be accepted when you finalize)` : ""}
              </h3>
              <p className="mt-0.5 text-xs text-emerald-900/80">Finalizing accepts them all, whatever their application said before. To leave someone out, take their works out of the sandbox.</p>
              <ul className="mt-2 divide-y divide-emerald-200/70">
                {firstTime.map((c) => (
                  <li key={c.artistId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/artists/${c.artistId}`} className="font-medium underline-offset-2 hover:underline">
                        {c.artistName}
                      </Link>
                      <span className="ml-2 text-xs text-muted">
                        {c.accepted ? "Already accepted" : c.application ? `Application: ${c.application.status}` : `No application to ${show.name}`}
                      </span>
                      <p className="truncate text-xs text-muted">{c.works.map((w) => w.title).join(" · ")}</p>
                    </div>
                    {!c.accepted && <button
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setAccepting(c.artistId);
                        start(async () => {
                          try {
                            await acceptArtistForShow(show.id, c.artistId);
                            router.refresh();
                          } catch (e) {
                            setError(errorText(e));
                          } finally {
                            setAccepting(null);
                          }
                        });
                      }}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-50"
                    >
                      {accepting === c.artistId ? "Accepting…" : "Accept artist"}
                    </button>}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">
                Or take their works out of the sandbox, or decide on the{" "}
                <Link href={`/admin/review/${show.id}/new`} className="underline">
                  New applicants page
                </Link>
                .
              </p>
            </section>
          )}

          {soldOrArchived.length > 0 && (
            <section className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
              <h3 className="font-medium text-amber-900">Check these before you finalize</h3>
              <ul className="mt-1 list-disc pl-5 text-amber-900">
                {soldOrArchived.map((w) => (
                  <li key={w.id}>
                    {w.artistName}, “{w.title}” is {w.sold && w.archived ? "sold and archived" : w.sold ? "marked sold" : "archived by the artist"}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {missing.length > 0 && (
            <details className="rounded-lg bg-paper p-3 ring-1 ring-line">
              <summary className="cursor-pointer font-medium">
                {missing.length} roster artist{missing.length === 1 ? " has" : "s have"} no work in this install
              </summary>
              <p className="mt-1 text-xs text-muted">Just so you know: this doesn&apos;t stop you finalizing.</p>
              <MissingList rows={missing} show={show} />
            </details>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 ring-1 ring-line">
              Cancel
            </button>
            <button
              disabled={busy || !items.length}
              onClick={() => {
                setError("");
                start(async () => {
                  try {
                    setDone(await finalizeSandbox(show.id));
                    router.refresh();
                  } catch (e) {
                    setError(errorText(e));
                  }
                });
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40"
            >
              {busy && !accepting ? "Finalizing…" : `Finalize ${items.length} work${items.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const n = (x: number | null) => (x === null || x === undefined ? "" : String(Math.round(x * 100) / 100));

/** Click a work in the sandbox: big photo, details, and a quick fix for size, medium and category. */
export function WorkDetailsPanel({
  work,
  inSandbox,
  selected,
  onToggleSelect,
  onAdd,
  onRemove,
  mover,
  onClose,
}: {
  work: SandboxWork;
  inSandbox: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAdd: () => void;
  onRemove: () => void;
  /** Present in the to-scale view: lets you send the work to another wall. */
  mover?: WallMover | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [extra, setExtra] = useState<{ full: string | null; description: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    sandboxWorkDetails(work.id)
      .then((d) => live && setExtra(d))
      .catch(() => live && setExtra({ full: null, description: null }));
    return () => {
      live = false;
    };
  }, [work.id]);

  const [form, setForm] = useState({
    height: n(work.height),
    width: n(work.width),
    depth: n(work.depth),
    unit: work.unit === "cm" ? "cm" : "in",
    medium: work.medium ?? "",
    category: work.category ?? "",
  });
  useEffect(() => {
    setForm({ height: n(work.height), width: n(work.width), depth: n(work.depth), unit: work.unit === "cm" ? "cm" : "in", medium: work.medium ?? "", category: work.category ?? "" });
  }, [work]);
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setMsg(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const input = "w-full rounded-md px-2 py-1.5 ring-1 ring-line";
  const image = extra?.full ? { ...work.image!, full: extra.full } : (work.image ?? undefined);

  return (
    <Modal onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex items-center justify-center overflow-hidden rounded-lg bg-[#f3f0ea]">
          <ArtworkImage image={image} title={work.title} size="full" fallbackRatio={work.width && work.height ? work.width / work.height : null} className="max-h-[75vh] w-auto object-contain" />
        </div>
        <div className="min-w-0 text-sm">
          {work.artistId ? (
            <Link href={`/admin/artists/${work.artistId}`} className="text-muted underline-offset-2 hover:underline">
              {work.artistName}
            </Link>
          ) : (
            <p className="text-muted">{work.artistName}</p>
          )}
          <h2 className="font-display text-2xl leading-tight">{work.title}</h2>
          <p className="mt-1 text-muted">
            {[work.medium, work.year, formatSize(work), formatPrice(work.price)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className={`rounded-full px-2 py-0.5 ring-1 ${work.artistKind === "roster" ? "bg-stone-100 ring-stone-300" : "bg-sky-50 text-sky-800 ring-sky-200"}`}>
              {work.artistKind === "roster" ? "Roster artist" : "New artist"}
            </span>
            {work.application && (
              <span className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_TONE[work.application.status] ?? "ring-line"}`}>Application: {work.application.status}</span>
            )}
            {work.showStatus && <span className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_TONE[work.showStatus] ?? "ring-line"}`}>This work: {work.showStatus}</span>}
            {needsAcceptance(work) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800 ring-1 ring-red-200">Accept the artist before finalizing</span>}
            {work.sold && <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-line">Sold</span>}
            {work.archived && <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-line">Archived</span>}
            {work.pastShows.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-line">Shown in {work.pastShows.join(", ")}</span>}
          </div>
          {extra?.description && <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-line text-muted">{extra.description}</p>}

          <form
            className="mt-4 space-y-3 rounded-lg bg-paper p-3 ring-1 ring-line"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              start(async () => {
                try {
                  await updateWork(work.id, form);
                  setMsg({ ok: true, text: "Saved." });
                  router.refresh();
                } catch (err) {
                  setMsg({ ok: false, text: errorText(err) });
                }
              });
            }}
          >
            <p className="font-medium">Fix the details</p>
            {work.sizeAsEntered && (
              <p className="text-xs text-muted">
                The artist typed: <span className="text-ink">{work.sizeAsEntered}</span>
              </p>
            )}
            <div className="grid grid-cols-4 gap-2">
              <label className="text-xs text-muted">
                Height
                <input inputMode="decimal" value={form.height} onChange={set("height")} className={input} />
              </label>
              <label className="text-xs text-muted">
                Width
                <input inputMode="decimal" value={form.width} onChange={set("width")} className={input} />
              </label>
              <label className="text-xs text-muted">
                Depth
                <input inputMode="decimal" value={form.depth} onChange={set("depth")} placeholder="optional" className={input} />
              </label>
              <label className="text-xs text-muted">
                Unit
                <select value={form.unit} onChange={set("unit")} className={input}>
                  <option value="in">in</option>
                  <option value="cm">cm</option>
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted">
              Medium
              <input value={form.medium} onChange={set("medium")} placeholder="e.g. Oil on canvas" className={input} />
            </label>
            <label className="block text-xs text-muted">
              Category
              <select value={form.category} onChange={set("category")} className={input}>
                <option value="">Not set</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button disabled={saving} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              {msg && <span className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
            </div>
          </form>

          {mover && <MoveToWall key={work.id} id={work.id} mover={mover} />}

          <div className="mt-3 flex flex-wrap gap-2">
            {inSandbox ? (
              <button onClick={onToggleSelect} className="rounded-md px-3 py-1.5 ring-1 ring-line hover:bg-paper">
                {selected ? "Unselect" : "Select"}
              </button>
            ) : null}
            {inSandbox ? (
              <button
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="rounded-md px-3 py-1.5 text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                title="Takes it off the walls and puts it back in the list on the right. Nothing else changes."
              >
                Take out of sandbox
              </button>
            ) : (
              <button
                onClick={() => {
                  onAdd();
                  onClose();
                }}
                className="rounded-md bg-ink px-3 py-1.5 text-white"
              >
                Add to sandbox
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** "Move to" dropdown: sends the work to another wall (into the free spot nearest the hanging height) or the floor. */
function MoveToWall({ id, mover }: { id: string; mover: WallMover }) {
  const [at, setAt] = useState(() => mover.where(id));
  const [note, setNote] = useState<string | null>(null);
  return (
    <label className="mt-3 block text-sm">
      <span className="text-muted">Move to</span>
      <select
        value={String(at)}
        onChange={(e) => {
          const wi = Number(e.target.value);
          const res = mover.move(id, wi);
          setAt(wi);
          const name = wi === FLOOR ? "the floor" : (mover.walls.find((w) => w.index === wi)?.label.split(" · ")[0] ?? "that wall");
          setNote(res === "overlap" ? `Moved to ${name}. There's no free space, so it overlaps other works: drag it into place.` : `Moved to ${name}.`);
        }}
        className="mt-1 block w-full rounded-md border border-line bg-paper px-2 py-1.5"
      >
        {at === IN_TRAY && (
          <option value={String(IN_TRAY)} disabled>
            Not on a wall yet
          </option>
        )}
        {mover.walls.map((w) => (
          <option key={w.index} value={String(w.index)}>
            {w.label}
          </option>
        ))}
        <option value={String(FLOOR)}>Floor / pedestal (sculpture box)</option>
      </select>
      {note && <span className="mt-1 block text-emerald-700">{note}</span>}
    </label>
  );
}

/** A roster artist (has a collection on the ARRAE site) with no work in the sandbox. */
export type MissingArtist = {
  id: string;
  name: string;
  /** Works they submitted to this show that aren't in the sandbox. */
  submittedHere: number;
  /** Their works that aren't sold or archived. */
  available: number;
  /** Shows they've had work in, most recent last as stored. */
  shows: string[];
};

export function missingRoster(roster: { id: string; name: string }[], works: SandboxWork[], inSandbox: Set<string | null>): MissingArtist[] {
  return roster
    .filter((a) => !inSandbox.has(a.id))
    .map((a) => {
      const mine = works.filter((w) => w.artistId === a.id);
      return {
        id: a.id,
        name: a.name,
        submittedHere: mine.filter((w) => w.showStatus).length,
        available: mine.filter((w) => !w.sold && !w.archived).length,
        shows: [...new Set(mine.flatMap((w) => w.pastShows))],
      };
    })
    .sort((a, b) => b.submittedHere - a.submittedHere || a.name.localeCompare(b.name));
}

function MissingList({ rows, show }: { rows: MissingArtist[]; show: { name: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
            <Link href={`/admin/artists/${r.id}`} className="font-medium underline-offset-2 hover:underline">
              {r.name}
            </Link>
            {r.submittedHere > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                sent {r.submittedHere} to {show.name}, none in the sandbox
              </span>
            )}
            <span className="text-xs text-muted">
              {r.available ? `${r.available} available work${r.available === 1 ? "" : "s"}` : "no available works"}
              {r.shows.length > 0 && ` · shown in ${r.shows.join(", ")}`}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(rows.map((r) => r.name).join("\n")).then(() => setCopied(true), () => {});
        }}
        className="mt-2 text-xs underline"
      >
        {copied ? "Copied" : "Copy the names"}
      </button>
    </div>
  );
}

/** "Roster check": the same report on its own, any time while curating. */
export function RosterReport({ show, rows, total, onClose }: { show: { id: string; name: string }; rows: MissingArtist[]; total: number; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl">Roster check · {show.name}</h2>
      <p className="mt-2 text-sm text-muted">
        {rows.length
          ? `${rows.length} of ${total} roster artists (artists with a collection on the ARRAE site) have no work in this sandbox. Artists who sent works to ${show.name} are listed first.`
          : `All ${total} roster artists have at least one work in this sandbox.`}{" "}
        To add someone, search their name in “Add works” on the right.
      </p>
      {rows.length > 0 && <MissingList rows={rows} show={show} />}
    </Modal>
  );
}
