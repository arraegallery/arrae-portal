"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { ShowTracker, TrackedWork, TrackStage } from "@/lib/show-tracker";
import { markWorks } from "../../../logistics/actions";
import { markAvailableAgain, markUnavailable, passOnWork, pickReplacement, saveDamageNote, stopReplacementInvite } from "./actions";

type Props = ShowTracker & { owner: boolean; emailReady: boolean; /** Inside the one-page show view, which has its own title. */ embedded?: boolean };
type Filter = "all" | TrackStage | "damage";
type View = "pictures" | "list";

const TZ = "America/New_York";
const fmtBooking = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export const STAGE: Record<TrackStage, { label: string; long: string }> = {
  waiting: { label: "Nothing yet", long: "No drop-off time booked yet" },
  booked: { label: "Drop-off booked", long: "Artist picked a drop-off time" },
  received: { label: "Dropped off", long: "In the gallery" },
  unavailable: { label: "No longer available", long: "The artist can't show this work" },
};

/** Red dot = nothing yet, yellow check = booked, green check = dropped off, grey × = unavailable. */
export function StageIcon({ stage, size = "md" }: { stage: TrackStage; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-4 w-4 text-[10px]" : "h-6 w-6 text-sm";
  if (stage === "waiting")
    return (
      <span title={STAGE.waiting.long} className={`inline-flex ${box} shrink-0 items-center justify-center`}>
        <span className={`${size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} rounded-full bg-rose-500 ring-2 ring-white`} />
      </span>
    );
  const tone = stage === "booked" ? "bg-amber-400 text-white" : stage === "received" ? "bg-emerald-600 text-white" : "bg-stone-400 text-white";
  return (
    <span title={STAGE[stage].long} className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full font-bold leading-none ring-2 ring-white ${tone}`}>
      {stage === "unavailable" ? "×" : "✓"}
    </span>
  );
}

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
        if (r && r.ok === false) throw new Error(r.error);
        after?.();
        router.refresh();
      } catch (e) {
        const msg = (e as Error).message || "";
        setError(/Server Action .* was not found/i.test(msg) ? "This page is out of date. Please reload it (Cmd+R) and try again." : msg || "Something went wrong");
      }
    });
  return { run, pending, error };
}

function readPref<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function WorksTracker({ show, works, replacements, hasDropoffWindow, owner, emailReady, embedded }: Props) {
  const [view, setView] = useState<View>("pictures");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setView(readPref<View>("works-view", ["pictures", "list"], "pictures")), []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("works-view", v);
    } catch {}
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, waiting: 0, booked: 0, received: 0, unavailable: 0, damage: 0 };
    for (const w of works) {
      c[w.stage]++;
      if (w.damageNote) c.damage++;
      if (w.stage !== "unavailable") c.all++;
    }
    return c;
  }, [works]);
  const needle = q.trim().toLowerCase();
  const shown = works.filter(
    (w) => (filter === "all" ? w.stage !== "unavailable" : filter === "damage" ? !!w.damageNote : w.stage === filter) && (!needle || w.title.toLowerCase().includes(needle) || w.artist.toLowerCase().includes(needle)),
  );
  const artistsShown = new Set(shown.map((w) => w.artistId)).size;
  const open = works.find((w) => w.id === openId) ?? replacements.flatMap((r) => r.candidates).find((w) => w.id === openId) ?? null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24">
{embedded ? (
        <section className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <p className="max-w-2xl text-muted">Click a work to mark it dropped off{owner ? ", or to mark it no longer available and ask the artist for another" : ""}.</p>
          <div className="flex flex-wrap gap-2">
            {owner && (
              <a href={`/admin/s/${show.id}/labels`} download title="Wall labels for every work in the show, ready to import into the Niimbot app" className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
                Download labels (.xlsx)
              </a>
            )}
            <Link href="/admin/logistics" className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">Drop-off times</Link>
          </div>
        </section>
      ) : (
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{show.name}</p>
          <h1 className="font-display text-4xl">Works &amp; drop-off</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every work in the show and where it is on its way in. Click a work to mark it dropped off{owner ? ", or to mark it no longer available and ask the artist for another" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {owner && (
            <Link href={`/admin/sandbox/${show.id}`} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
              Sandbox
            </Link>
          )}
          {owner && (
            <a href={`/admin/s/${show.id}/labels`} download title="Wall labels for every work in the show, ready to import into the Niimbot app" className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
              Download labels (.xlsx)
            </a>
          )}
          <Link href="/admin/logistics" className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
            Drop-off calendar
          </Link>
        </div>
      </section>
      )}

      {!hasDropoffWindow && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">This show has no drop-off times yet, so no work can show as booked. Add them on the Logistics page.</p>}

      {owner && replacements.length > 0 && <Replacements show={show} replacements={replacements} emailReady={emailReady} onOpen={setOpenId} />}

      <div className="sticky top-[57px] z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {(["all", "waiting", "booked", "received", "unavailable", ...(counts.damage ? ["damage"] : [])] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ${filter === f ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:bg-paper"}`}
          >
            {f === "damage" ? <span className="text-rose-700">⚠</span> : f !== "all" && <StageIcon stage={f} size="sm" />}
            {f === "all" ? "All works" : f === "damage" ? "Damage noted" : STAGE[f].label}
            <span className={`text-xs ${filter === f ? "text-white/70" : "text-muted"}`}>{counts[f]}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an artist or title" className="ml-auto w-56 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" />
        <div className="flex overflow-hidden rounded-md text-sm ring-1 ring-line">
          {(["pictures", "list"] as View[]).map((v) => (
            <button key={v} onClick={() => pickView(v)} className={`px-3 py-1.5 ${view === v ? "bg-ink text-white" : "bg-white hover:bg-paper"}`}>
              {v === "pictures" ? "Pictures" : "List"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {shown.length} work{shown.length === 1 ? "" : "s"} by {artistsShown} artist{artistsShown === 1 ? "" : "s"}
      </p>

      {view === "pictures" ? (
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map((w) => (
            <button key={w.id} onClick={() => setOpenId(w.id)} className="group text-left">
              <div className={`relative overflow-hidden rounded-md bg-white ring-1 ring-line group-hover:ring-ink ${w.stage === "unavailable" ? "opacity-50 grayscale" : ""}`}>
                <ArtworkImage image={w.image ?? undefined} title={w.title} />
                <span className="absolute left-2 top-2">
                  <StageIcon stage={w.stage} />
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-medium">{w.title}</p>
              <p className="truncate text-xs text-muted">
                {w.artist}
                {w.stage === "booked" && w.booking ? ` · ${fmtDay(w.booking)}` : ""}
              </p>
              {!w.agreementSigned && w.stage !== "unavailable" && <p className="mt-0.5 text-[11px] text-amber-800">Agreement not signed</p>}
              {w.damageNote && (
                <p className="mt-0.5 truncate text-[11px] font-medium text-rose-700" title={w.damageNote}>
                  ⚠ Damage: {w.damageNote}
                </p>
              )}
            </button>
          ))}
        </div>
      ) : (
        <WorksList works={shown} showId={show.id} onOpen={setOpenId} />
      )}
      {!shown.length && <p className="mt-6 text-sm text-muted">No works here.</p>}

      {open && <WorkPanel w={open} show={show} owner={owner} emailReady={emailReady} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function ReceivedBox({ w, showId }: { w: TrackedWork; showId: string }) {
  const { run, pending, error } = useRun();
  if (w.stage === "unavailable") return <span className="text-xs text-muted">—</span>;
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs" title={w.receivedAt ? `Dropped off ${fmtBooking(w.receivedAt)}${w.receivedBy ? ` (${w.receivedBy})` : ""}` : "Tick when the work is in the gallery"}>
      <input type="checkbox" disabled={pending} checked={!!w.receivedAt} onChange={(e) => run(() => markWorks(showId, [w.id], "received", e.target.checked))} />
      {w.receivedAt ? fmtDay(w.receivedAt) : "Not yet"}
      {error && <span className="text-rose-700">{error}</span>}
    </label>
  );
}

function WorksList({ works, showId, onOpen }: { works: TrackedWork[]; showId: string; onOpen: (id: string) => void }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg bg-white ring-1 ring-line">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="w-8 p-2" />
            <th className="w-14 p-2" />
            <th className="p-2">Artist</th>
            <th className="p-2">Work</th>
            <th className="p-2">Size</th>
            <th className="p-2">Medium</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2">Agreement</th>
            <th className="p-2">Drop-off time</th>
            <th className="p-2">Dropped off</th>
            <th className="p-2">Damage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {works.map((w) => (
            <tr key={w.id} className={`hover:bg-paper/60 ${w.stage === "unavailable" ? "text-muted" : ""}`}>
              <td className="p-2">
                <StageIcon stage={w.stage} size="sm" />
              </td>
              <td className="p-2">
                <button onClick={() => onOpen(w.id)} className="block w-12 overflow-hidden rounded ring-1 ring-line">
                  <ArtworkImage image={w.image ?? undefined} title="" />
                </button>
              </td>
              <td className="p-2">
                {w.artistId ? (
                  <Link href={`/admin/artists/${w.artistId}`} className="hover:underline">
                    {w.artist}
                  </Link>
                ) : (
                  w.artist
                )}
              </td>
              <td className="p-2">
                <button onClick={() => onOpen(w.id)} className={`text-left font-medium hover:underline ${w.stage === "unavailable" ? "line-through" : ""}`}>
                  {w.title}
                </button>
              </td>
              <td className="whitespace-nowrap p-2 text-xs">{formatSize(w)}</td>
              <td className="max-w-[14rem] truncate p-2 text-xs" title={w.medium ?? ""}>
                {w.medium || w.category || "—"}
              </td>
              <td className="whitespace-nowrap p-2 text-right text-xs">{formatPrice(w.price)}</td>
              <td className="p-2 text-xs">{w.agreementSigned ? <span className="text-emerald-800">Signed</span> : <span className="text-amber-800">Not signed</span>}</td>
              <td className="whitespace-nowrap p-2 text-xs">{w.booking ? fmtBooking(w.booking) : <span className="text-rose-700">Not booked</span>}</td>
              <td className="p-2">
                <ReceivedBox w={w} showId={showId} />
              </td>
              <td className="max-w-[14rem] p-2 text-xs">
                {w.damageNote ? (
                  <button onClick={() => onOpen(w.id)} title={w.damageNote} className="block max-w-full truncate text-left font-medium text-rose-700 hover:underline">
                    ⚠ {w.damageNote}
                  </button>
                ) : w.stage === "unavailable" ? (
                  "—"
                ) : (
                  <button onClick={() => onOpen(w.id)} className="text-muted hover:underline">
                    Add note
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkPanel({ w, show, owner, emailReady, onClose }: { w: TrackedWork; show: Props["show"]; owner: boolean; emailReady: boolean; onClose: () => void }) {
  const { run, pending, error } = useRun();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const inShow = w.status === "Selected" || w.status === "Requested";
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-paper p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <StageIcon stage={w.stage} />
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight">{w.title}</h2>
            <p className="text-sm">
              {w.artistId ? (
                <Link href={`/admin/artists/${w.artistId}`} className="hover:underline">
                  {w.artist}
                </Link>
              ) : (
                w.artist
              )}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-md px-2 py-1 text-lg leading-none ring-1 ring-line" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-md bg-white ring-1 ring-line">
          <ArtworkImage image={w.image ?? undefined} title={w.title} size="full" className="max-h-[60vh] object-contain" />
        </div>

        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Where it is</dt>
          <dd className="font-medium">{inShow || w.status === "Unavailable" ? STAGE[w.stage].label : "Sent in, not in the show yet"}</dd>
          <dt className="text-muted">Drop-off time</dt>
          <dd>{w.booking ? fmtBooking(w.booking) : "Not booked yet"}</dd>
          <dt className="text-muted">Agreement</dt>
          <dd>{w.agreementSigned ? "Signed in the portal" : <span className="text-amber-800">Not signed in the portal yet</span>}</dd>
          <dt className="text-muted">Size</dt>
          <dd>
            {formatSize(w)}
            {w.framed ? " · framed" : ""}
          </dd>
          <dt className="text-muted">Medium</dt>
          <dd>{w.medium || w.category || "—"}</dd>
          {w.year && (
            <>
              <dt className="text-muted">Year</dt>
              <dd>{w.year}</dd>
            </>
          )}
          <dt className="text-muted">Price</dt>
          <dd>{formatPrice(w.price)}</dd>
          <dt className="text-muted">Contact</dt>
          <dd className="break-all">{[w.phone, w.email].filter(Boolean).join(" · ") || "—"}</dd>
        </dl>

        <div className="mt-5 space-y-3 border-t border-line pt-4">
          {inShow && (
            <button
              disabled={pending}
              onClick={() => run(() => markWorks(show.id, [w.id], "received", !w.receivedAt))}
              className={`w-full rounded-md px-4 py-2 text-sm ${w.receivedAt ? "bg-white ring-1 ring-line" : "bg-emerald-700 text-white"} disabled:opacity-50`}
            >
              {w.receivedAt ? `Dropped off ${fmtBooking(w.receivedAt)} · click to undo` : "✓ Mark dropped off"}
            </button>
          )}
          {inShow && <DamageBox w={w} showId={show.id} />}
          {owner && inShow && !unavailable && (
            <button onClick={() => setUnavailable(true)} className="w-full rounded-md bg-white px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50">
              No longer available…
            </button>
          )}
          {owner && inShow && unavailable && <UnavailableForm w={w} show={show} emailReady={emailReady} onDone={() => setUnavailable(false)} />}
          {owner && w.status === "Unavailable" && (
            <button disabled={pending} onClick={() => run(() => markAvailableAgain(show.id, w.id))} className="w-full rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
              It&rsquo;s available after all: put it back in the show
            </button>
          )}
          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>
      </aside>
    </div>
  );
}

function UnavailableForm({ w, show, emailReady, onDone }: { w: TrackedWork; show: Props["show"]; emailReady: boolean; onDone: () => void }) {
  const { run, pending, error } = useRun();
  const [ask, setAsk] = useState(emailReady && !!w.artistId);
  const [subject, setSubject] = useState(`A replacement for "${w.title}" in ${show.name}`);
  const [message, setMessage] = useState(
    `Hi {first_name},\n\nThank you for letting us know that "${w.title}" is no longer available for ${show.name}. You're welcome to send us another work in its place.\n\nSign in to your ARRAE studio with this email address, then put forward a past work or choose "Add a new work". We'll let you know which work we'll show.\n\nWarmly,\nARRAE`,
  );
  return (
    <div className="rounded-md bg-white p-3 text-sm ring-1 ring-rose-200">
      <p className="font-medium">Mark &ldquo;{w.title}&rdquo; as no longer available?</p>
      <p className="mt-1 text-xs text-muted">It comes out of the show and the sandbox. {first(w.artist)} will see &ldquo;No longer available&rdquo; in their studio. You can undo this.</p>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={ask} disabled={!emailReady || !w.artistId} onChange={(e) => setAsk(e.target.checked)} />
        <span>
          Ask {first(w.artist)} for a replacement
          <span className="block text-xs text-muted">They can add one work to their {show.name} application from their studio, and get this email (replies go to hello@).</span>
        </span>
      </label>
      {ask && (
        <div className="mt-2 space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="h-48 w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line" />
          <p className="text-xs text-muted">{"{first_name}"} becomes {first(w.artist)}.</p>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onDone} className="rounded-md px-3 py-1.5 ring-1 ring-line">
          Cancel
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => markUnavailable(show.id, w.id, ask ? { count: 1, subject, message } : null), onDone)}
          className="ml-auto rounded-md bg-rose-700 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {pending ? "Working…" : ask ? "Mark unavailable and email" : "Mark unavailable"}
        </button>
      </div>
      {error && <p className="mt-2 text-rose-700">{error}</p>}
    </div>
  );
}

function Replacements({ show, replacements, emailReady, onOpen }: { show: Props["show"]; replacements: Props["replacements"]; emailReady: boolean; onOpen: (id: string) => void }) {
  return (
    <section className="mb-6 rounded-lg bg-white p-4 ring-1 ring-line">
      <h2 className="text-xs uppercase tracking-wider text-muted">Replacements</h2>
      <p className="mt-1 text-sm text-muted">Artists with a work that fell through. Works they send in for {show.name} show up here: pick one to put in the show.</p>
      <ul className="mt-3 divide-y divide-line">
        {replacements.map((r) => (
          <ReplacementRow key={r.artistId} r={r} show={show} emailReady={emailReady} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function ReplacementRow({ r, show, emailReady, onOpen }: { r: Props["replacements"][number]; show: Props["show"]; emailReady: boolean; onOpen: (id: string) => void }) {
  const { run, pending, error } = useRun();
  const [using, setUsing] = useState<string | null>(null);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <Link href={`/admin/artists/${r.artistId}`} className="font-medium hover:underline">
          {r.artist}
        </Link>
        <span className="text-xs text-muted">No longer available: {r.unavailable.map((t) => `"${t}"`).join(", ")}</span>
        <span className="ml-auto text-xs">
          {r.invitedLeft > 0 ? (
            <>
              Can add {r.invitedLeft} more from their studio ·{" "}
              <button disabled={pending} onClick={() => confirm(`Stop ${r.artist} adding more works for ${show.name}?`) && run(() => stopReplacementInvite(show.id, r.artistId))} className="underline">
                Stop
              </button>
            </>
          ) : (
            <span className="text-muted">Not invited to add works</span>
          )}
        </span>
      </div>
      {r.candidates.length ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {r.candidates.map((c) => (
            <div key={c.id} className="w-40">
              <button onClick={() => onOpen(c.id)} className="block w-full overflow-hidden rounded-md ring-1 ring-line hover:ring-ink">
                <ArtworkImage image={c.image ?? undefined} title={c.title} />
              </button>
              <p className="mt-1 truncate text-xs font-medium">{c.title}</p>
              <p className="truncate text-[11px] text-muted">{formatSize(c)}</p>
              <div className="mt-1 flex gap-1 text-xs">
                <button onClick={() => setUsing(using === c.id ? null : c.id)} className="rounded-md bg-ink px-2 py-1 text-white">
                  Use this
                </button>
                <button disabled={pending} onClick={() => confirm(`Pass on "${c.title}"? It's marked Not included for ${show.name}.`) && run(() => passOnWork(show.id, c.id))} className="rounded-md px-2 py-1 ring-1 ring-line">
                  Pass
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">Nothing sent in yet.</p>
      )}
      {using && <UseForm key={using} work={r.candidates.find((c) => c.id === using)!} replacing={r.unavailable} show={show} emailReady={emailReady} onDone={() => setUsing(null)} />}
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function UseForm({ work, replacing, show, emailReady, onDone }: { work: TrackedWork; replacing: string[]; show: Props["show"]; emailReady: boolean; onDone: () => void }) {
  const { run, pending, error } = useRun();
  const [tell, setTell] = useState(emailReady);
  const [subject, setSubject] = useState(`"${work.title}" will be in ${show.name}`);
  const [message, setMessage] = useState(
    `Hi {first_name},\n\nWe'd love to show "${work.title}" in ${show.name} in place of ${replacing.map((t) => `"${t}"`).join(" and ")}. Please bring it with your other works at your drop-off time.\n\nWarmly,\nARRAE`,
  );
  return (
    <div className="mt-3 max-w-xl rounded-md bg-paper p-3 text-sm ring-1 ring-line">
      <p className="font-medium">Put &ldquo;{work.title}&rdquo; in the show?</p>
      <p className="mt-1 text-xs text-muted">It becomes Selected and goes into the sandbox (place it on a wall there).</p>
      <label className="mt-2 flex items-center gap-2">
        <input type="checkbox" checked={tell} disabled={!emailReady} onChange={(e) => setTell(e.target.checked)} /> Email {first(work.artist)} to let them know
      </label>
      {tell && (
        <div className="mt-2 space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="h-36 w-full rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button onClick={onDone} className="rounded-md px-3 py-1.5 ring-1 ring-line">
          Cancel
        </button>
        <button disabled={pending} onClick={() => run(() => pickReplacement(show.id, work.id, tell ? { subject, message } : null), onDone)} className="ml-auto rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-50">
          {pending ? "Working…" : tell ? "Put in the show and email" : "Put in the show"}
        </button>
      </div>
      {error && <p className="mt-2 text-rose-700">{error}</p>}
    </div>
  );
}

/** What was wrong with the work when it came in. Saved on the work for this show; clear the text to remove it. */
function DamageBox({ w, showId }: { w: TrackedWork; showId: string }) {
  const { run, pending, error } = useRun();
  const [open, setOpen] = useState(!!w.damageNote);
  const [text, setText] = useState(w.damageNote ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setText(w.damageNote ?? "");
    setOpen(!!w.damageNote);
  }, [w.id, w.damageNote]);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line hover:bg-paper">
        ⚠ Note damage…
      </button>
    );
  const changed = text.trim() !== (w.damageNote ?? "");
  return (
    <div className={`rounded-md p-3 text-sm ring-1 ${w.damageNote ? "bg-rose-50 ring-rose-200" : "bg-white ring-line"}`}>
      <label className="block font-medium" htmlFor={`damage-${w.id}`}>
        Damage seen at drop-off
      </label>
      <textarea
        id={`damage-${w.id}`}
        value={text}
        onChange={(e) => (setText(e.target.value), setSaved(false))}
        placeholder="e.g. Scratch on the lower left corner of the frame; hanging wire loose."
        className="mt-1.5 h-24 w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line"
      />
      {w.damageNote && w.damageNotedAt && (
        <p className="mt-1 text-xs text-muted">
          Noted {fmtBooking(w.damageNotedAt)}
          {w.damageNotedBy ? ` by ${w.damageNotedBy}` : ""}. Clear the text and save to remove it.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {saved && !changed && <span className="text-xs text-emerald-800">Saved</span>}
        {error && <span className="text-xs text-rose-700">{error}</span>}
        <button
          onClick={() => {
            setText(w.damageNote ?? "");
            if (!w.damageNote) setOpen(false);
          }}
          className="ml-auto rounded-md px-3 py-1.5 ring-1 ring-line"
        >
          Cancel
        </button>
        <button disabled={pending || !changed} onClick={() => run(() => saveDamageNote(showId, w.id, text), () => setSaved(true))} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}
