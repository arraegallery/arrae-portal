"use client";

import Link from "next/link";
import { parseAmount } from "@/lib/amount";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addNote,
  addWorkPhotos,
  addWorksToShow,
  clearPhotoRequest,
  moveWorksToShow,
  getWorkPhotos,
  makeWorkMainPhoto,
  prepareWorkPhotoUploads,
  removeWorkPhoto,
  requestBetterPhotos,
  sendMessageToArtist,
  setOnboardingStep,
  updateArtist,
  updateWork,
} from "../../actions";
import { AgreementPanel, type AgreementSummary } from "../../agreements/AgreementPanel";
import { DocumentCenter } from "@/components/DocumentCenter";
import type { DocRow } from "@/lib/document-kinds";
import { addArtistDocument, prepareArtistDocument, removeArtistDocument, setDocumentVisible } from "../../documents/actions";
import { PhotoManager } from "@/components/PhotoManager";
import { Thread } from "@/components/Thread";
import { ARTIST_ONBOARDING, SHOW_ONBOARDING, readOnboarding, type Onboarding } from "@/lib/onboarding";
import { TRACKED_FIELDS } from "@/lib/change-fields";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { getArtistProfile } from "@/lib/queries";
import { STATUS_TONE } from "@/lib/status";

type Profile = NonNullable<Awaited<ReturnType<typeof getArtistProfile>>>;
type Work = Profile["works"][number];

const FIELDS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["social", "Instagram / social"],
  ["education", "Education"],
  ["shopifyCollectionHandle", "Shopify collection handle"],
] as const;

type Change = Profile["changes"][number];

const ASK_NOTE = "Thank you for applying! Could you send us better photos of this work? Straight on, in good natural light, filling the frame, with no glare or background. A detail shot is welcome too.";
type ShowOption = Profile["shows"][number];

export function ArtistProfile({ profile, owner, agreement, documents }: { profile: Profile; owner: boolean; agreement: AgreementSummary; documents: DocRow[] | null }) {
  const a = profile.artist;
  const initial = {
    name: a.name,
    email: a.email,
    phone: a.phone ?? "",
    website: a.website ?? "",
    social: a.social ?? "",
    education: a.education ?? "",
    shopifyCollectionHandle: a.shopifyCollectionHandle ?? "",
    bio: a.bio ?? "",
    arraeBio: a.arraeBio ?? "",
    internalNotes: a.internalNotes ?? "",
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [onboarding, setOnboarding] = useState<Onboarding>(readOnboarding(a.onboarding));
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = (Object.keys(form) as (keyof typeof form)[]).filter((k) => form[k] !== saved[k]);

  function save() {
    const changes = Object.fromEntries(dirty.map((k) => [k, form[k]]));
    setStatus(null);
    startTransition(async () => {
      try {
        await updateArtist(a.id, changes);
        setSaved(form);
        setStatus("Saved");
      } catch (e) {
        setStatus((e as Error).message);
      }
    });
  }
  function toggleOnboarding(key: string, showId: string | null) {
    const current = showId ? !!onboarding.shows?.[showId]?.[key] : !!onboarding[key];
    const next: Onboarding = showId
      ? { ...onboarding, shows: { ...(onboarding.shows ?? {}), [showId]: { ...(onboarding.shows?.[showId] ?? {}), [key]: !current } } }
      : { ...onboarding, [key]: !current };
    setOnboarding(next);
    startTransition(async () => {
      try {
        setOnboarding(await setOnboardingStep(a.id, key, showId, !current));
      } catch (e) {
        setStatus((e as Error).message);
      }
    });
  }
  const inShows = profile.showHistory.filter((h) => h.exhibited);

  // The team sees the details as plain read-only boxes; only owners can edit them.
  const input = owner
    ? "w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line focus:ring-ink"
    : "w-full cursor-default resize-none rounded-md bg-paper px-3 py-2 text-sm ring-1 ring-line/60 outline-none";
  return (
    <main className="mx-auto max-w-6xl px-4 pb-32">
      <section className="py-6">
        <Link href="/admin/artists" className="text-sm text-muted hover:underline">
          ← All artists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">{saved.name}</h1>
          {!owner && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted ring-1 ring-line">View only</span>}
          {profile.onWaitlist && <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE.Waitlist}`}>On waitlist</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {profile.applications.map((ap) => (
            <Link
              key={ap.id}
              href={owner && ap.showId ? `/admin/review/${ap.showId}` : "#"}
              className={`rounded-full px-2.5 py-1 ring-1 ${STATUS_TONE[ap.status] ?? STATUS_TONE.New}`}
              title={`Applied ${ap.submittedOn ?? ""}`}
            >
              {ap.show}: {ap.status}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="text-sm">
                <span className="text-xs text-muted">{label}</span>
                <input value={form[k]} readOnly={!owner} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} />
              </label>
            ))}
          </div>

          <label className="block text-sm">
            <span className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-ink">ARRAE bio, for the Shopify collection</span>
              <span className="text-xs text-muted">{form.arraeBio.trim() ? `${form.arraeBio.trim().split(/\s+/).length} words` : "Not written yet"}</span>
            </span>
            <textarea
              value={form.arraeBio}
              readOnly={!owner} onChange={(e) => setForm({ ...form, arraeBio: e.target.value })}
              placeholder="Your standardized bio, in ARRAE's voice. This is the one that goes to Shopify."
              className={`${input} mt-1 h-48 leading-relaxed`}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted">Artist's own bio / statement (as they submitted it)</span>
            <textarea value={form.bio} readOnly={!owner} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={`${input} mt-1 h-40 leading-relaxed`} />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted">Internal notes (private)</span>
            <textarea value={form.internalNotes} readOnly={!owner} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} className={`${input} mt-1 h-28`} />
          </label>

          <div>
            <h2 className="text-xs uppercase tracking-wider text-muted">Shows</h2>
            {profile.showHistory.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Not in any show yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-lg bg-white text-sm ring-1 ring-line">
                {profile.showHistory.map((h) => (
                  <li key={h.showId} className="flex items-center gap-3 px-3 py-2">
                    {owner ? (
                      <Link href={`/admin/review/${h.showId}`} className="font-medium hover:underline">
                        {h.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{h.name}</span>
                    )}
                    <span className="text-xs text-muted">{h.type}</span>
                    <span className="ml-auto text-xs">
                      {h.exhibited ? (
                        <span className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_TONE.Selected}`}>
                          Exhibited{h.selectedWorks ? ` · ${h.selectedWorks} work${h.selectedWorks === 1 ? "" : "s"}` : ""}
                        </span>
                      ) : (
                        <span className="text-muted">
                          {h.status ?? "Submitted"} · {h.works} work{h.works === 1 ? "" : "s"} submitted
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-wider text-muted">Onboarding</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {ARTIST_ONBOARDING.map(([k, label]) => (
                <Chip key={k} done={!!onboarding[k]} label={label} disabled={!owner} onClick={() => toggleOnboarding(k, null)} />
              ))}
            </div>
            {owner && <AgreementPanel artistId={a.id} artistName={a.name} hasEmail={!!a.email} agreement={agreement} />}
            {inShows.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Show checklists appear here once the artist is selected for a show.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {inShows.map((h) => {
                  const steps = onboarding.shows?.[h.showId] ?? {};
                  const done = SHOW_ONBOARDING.filter(([k]) => steps[k]).length;
                  return (
                    <div key={h.showId}>
                      <p className="text-xs">
                        <span className="font-medium">{h.name}</span>{" "}
                        <span className="text-muted">
                          {done} of {SHOW_ONBOARDING.length}
                        </span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {SHOW_ONBOARDING.map(([k, label]) => (
                          <Chip key={k} done={!!steps[k]} label={label} disabled={!owner} onClick={() => toggleOnboarding(k, h.showId)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ChangeLog changes={profile.changes} works={profile.works} />
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted">Works ({profile.works.length})</h2>
          <ul className="mt-3 space-y-3">
            {profile.works.map((w) => (
              <WorkRow key={w.id} work={w} shows={profile.shows} owner={owner} artistName={saved.name} changes={profile.changes.filter((c) => c.workId === w.id)} />
            ))}
          </ul>
          <section id="messages" className="mt-8 scroll-mt-20">
            <h2 className="text-xs uppercase tracking-wider text-muted">Messages with {saved.name.split(/\s+/)[0]}</h2>
            <p className="mb-2 mt-1 text-xs text-muted">The artist sees this conversation in their studio and gets an email when you write.</p>
            <Thread initial={profile.messages} me="arrae" otherName={saved.name.split(/\s+/)[0]} send={(body) => sendMessageToArtist(a.id, body)} placeholder={`Write to ${saved.name}…`} />
          </section>
          {owner && documents && (
            <section id="documents" className="mt-8 scroll-mt-20">
              <h2 className="text-xs uppercase tracking-wider text-muted">Documents</h2>
              <p className="mb-2 mt-1 text-xs text-muted">Invoices, payment statements, W-9s and certificates. Signed agreements appear here on their own.</p>
              <DocumentCenter
                mode="arrae"
                initial={documents}
                artistName={saved.name.split(/\s+/)[0]}
                shows={profile.shows.map((x) => ({ id: x.id, name: x.name }))}
                actions={{
                  prepare: (name, size) => prepareArtistDocument(a.id, name, size),
                  add: (input) => addArtistDocument({ ...input, artistId: a.id }),
                  remove: removeArtistDocument,
                  setVisible: setDocumentVisible,
                }}
              />
            </section>
          )}
          <ArtistNotes artistId={a.id} notes={profile.notes} works={profile.works} />
        </section>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur transition ${dirty.length || status ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 text-sm">
          <span className="text-muted">{dirty.length ? `Unsaved changes: ${dirty.length}` : status}</span>
          {dirty.length > 0 && (
            <>
              <button onClick={() => setForm(saved)} className="ml-auto rounded-md bg-white px-3 py-1.5 ring-1 ring-line">
                Discard
              </button>
              <button onClick={save} disabled={pending} className="rounded-md bg-ink px-4 py-1.5 text-white disabled:opacity-50">
                {pending ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Chip({ done, label, onClick, disabled }: { done: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-full px-3 py-1 text-xs ring-1 disabled:cursor-default ${done ? STATUS_TONE.Selected : "bg-white ring-line"}`}>
      {done ? "✓ " : ""}
      {label}
    </button>
  );
}

const money = (v: string | null) => (v === null ? "no price" : formatPrice(Number(v)));
function describeChange(c: Change) {
  const label = TRACKED_FIELDS[c.field as keyof typeof TRACKED_FIELDS] ?? c.field;
  if (c.field === "priceUsd") return `Price ${money(c.oldValue)} → ${money(c.newValue)}`;
  if (c.field === "soldAt") return c.newValue ? "Marked sold" : "Marked available";
  if (c.field === "archivedAt") return c.newValue ? "Archived" : "Restored from archive";
  if (c.field === "description") return "Description edited";
  return `${label} “${c.oldValue ?? "—"}” → “${c.newValue ?? "—"}”`;
}
const who = (c: Change) => (c.role === "artist" ? "by the artist" : c.actor ? `by ${c.actor.split("@")[0]}` : "");
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function ChangeLog({ changes, works }: { changes: Change[]; works: Work[] }) {
  const titleOf = new Map(works.map((w) => [w.id, w.title]));
  const prices = changes.filter((c) => c.field === "priceUsd");
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-muted">Change log</h2>
      {changes.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No edits to these works yet. Price, title and size changes will be listed here.</p>
      ) : (
        <>
          {prices.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
              {prices.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{titleOf.get(c.workId) ?? "A work"}</span>: {describeChange(c)}{" "}
                  <span className="text-xs text-muted">
                    {when(c.at)} {who(c)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted">All {changes.length} changes</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {changes.map((c) => (
                <li key={c.id} className={c.field === "priceUsd" ? "font-medium" : ""}>
                  {when(c.at)} · {titleOf.get(c.workId) ?? "A work"}: {describeChange(c)} <span className="text-muted">{who(c)}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function WorkRow({ work: initial, shows, changes, owner, artistName }: { work: Work; shows: ShowOption[]; changes: Change[]; owner: boolean; artistName: string }) {
  const [work, setWork] = useState(initial);
  const [panel, setPanel] = useState<"photos" | "ask" | null>(null);
  const [viewing, setViewing] = useState(false);
  const [askNote, setAskNote] = useState(ASK_NOTE);
  const [asked, setAsked] = useState<string | null>(null);
  const [putForward, setPutForward] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const start = () => {
    setDraft({
      title: work.title,
      year: work.year ?? "",
      medium: work.medium ?? "",
      category: work.category ?? "",
      price: work.price === null ? "" : String(work.price),
      width: work.width === null ? "" : String(work.width),
      height: work.height === null ? "" : String(work.height),
      depth: work.depth === null ? "" : String(work.depth),
      unit: work.unit,
      description: work.description ?? "",
      sold: work.sold ? "yes" : "",
      archived: work.archived ? "yes" : "",
    });
    setEditing(true);
  };
  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        await updateWork(work.id, draft);
        const n = (v: string) => (v.trim() ? parseAmount(v) : null);
        setWork({ ...work, ...draft, sold: !!draft.sold, archived: !!draft.archived, price: n(draft.price), width: n(draft.width), height: n(draft.height), depth: n(draft.depth) });
        setEditing(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const field = (k: string, label: string, cls = "") => (
    <label className={`text-xs text-muted ${cls}`}>
      {label}
      <input value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line" />
    </label>
  );
  return (
    <li className="flex gap-3 rounded-lg bg-white p-3 ring-1 ring-line">
      <button onClick={() => setViewing(true)} title="Open large" className="w-24 shrink-0 cursor-zoom-in self-start overflow-hidden rounded hover:opacity-90">
        <ArtworkImage image={work.image ?? undefined} title={work.title} fallbackRatio={work.width && work.height ? work.width / work.height : null} />
      </button>
      {viewing && <WorkViewer work={work} artistName={artistName} changes={changes} onClose={() => setViewing(false)} />}
      <div className="min-w-0 flex-1 text-sm">
        {!editing ? (
          <>
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <button onClick={() => setViewing(true)} className="text-left font-medium hover:underline">
                  {work.title}
                </button>
                <p className="text-xs text-muted">
                  {[work.year, work.medium].filter(Boolean).join(" · ")}
                  {work.year || work.medium ? " · " : ""}
                  {formatSize(work)} · {formatPrice(work.price)}
                  {work.sold ? " · Sold" : ""}
                </p>
                {work.archived && (
                  <span
                    title={work.archivedBy ? `Archived by ${work.archivedBy}` : "Archived"}
                    className="mt-1 inline-block rounded bg-paper px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-line"
                  >
                    {work.archivedByArtist ? "Archived by artist" : "Archived"}
                  </span>
                )}
              </div>
              <div className="ml-auto flex shrink-0 gap-3 text-xs text-muted">
                {owner && (
                  <button onClick={() => setPanel(panel === "photos" ? null : "photos")} className="hover:underline">
                    Photos
                  </button>
                )}
                <button onClick={() => setPanel(panel === "ask" ? null : "ask")} className="hover:underline">
                  Ask for better photos
                </button>
                {owner && (
                  <button onClick={start} className="hover:underline">
                    Edit
                  </button>
                )}
              </div>
            </div>
            {work.photosRequestedAt && (
              <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 ring-1 ring-amber-200">
                Better photos requested {when(work.photosRequestedAt)}
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await clearPhotoRequest(work.id);
                      setWork({ ...work, photosRequestedAt: null });
                    })
                  }
                  className="underline"
                >
                  Clear
                </button>
              </p>
            )}
            {asked && <p className="mt-1 text-xs text-emerald-800">{asked}</p>}
            {panel === "photos" && (
              <div className="mt-2">
                <PhotoManager
                  actions={{
                    list: () => getWorkPhotos(work.id),
                    prepare: (n) => prepareWorkPhotoUploads(work.id, n),
                    add: (imgs, asMain) => addWorkPhotos(work.id, imgs, asMain),
                    makeMain: (id) => makeWorkMainPhoto(work.id, id),
                    remove: (id) => removeWorkPhoto(work.id, id),
                  }}
                  onChange={(main) => setWork({ ...work, image: main ? { id: main.id, thumb: main.thumb, full: main.full, w: main.w, h: main.h } : null })}
                />
              </div>
            )}
            {panel === "ask" && (
              <div className="mt-2 rounded-lg bg-paper p-3 ring-1 ring-line">
                <p className="text-xs text-muted">This goes to {artistName} in your message thread (and by email), with the work&rsquo;s title. They can upload new photos from their studio.</p>
                <textarea value={askNote} onChange={(e) => setAskNote(e.target.value)} className="mt-2 h-24 w-full rounded-md bg-white p-2 text-sm ring-1 ring-line" />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setPanel(null)} className="rounded-md px-3 py-1 text-xs ring-1 ring-line">
                    Cancel
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await requestBetterPhotos([work.id], askNote);
                          setWork({ ...work, photosRequestedAt: new Date().toISOString() });
                          setAsked(`Sent to ${artistName}. It's saved in your message thread with them.`);
                          setPanel(null);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      })
                    }
                    className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Send request
                  </button>
                </div>
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {work.shows.map((s) => (
                <span key={s.showId} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATUS_TONE[s.status] ?? STATUS_TONE.Submitted}`}>
                  {s.name}: {s.status}
                </span>
              ))}
              {!work.sold && owner && (
                <select
                  value={putForward}
                  disabled={pending}
                  onChange={(e) => {
                    const showId = e.target.value;
                    if (!showId) return;
                    setPutForward(showId);
                    const name = shows.find((x) => x.id === showId)?.name ?? showId;
                    startTransition(async () => {
                      try {
                        await addWorksToShow([work.id], showId);
                        setWork({ ...work, shows: [...work.shows, { showId, name, status: "Submitted" }] });
                      } catch (err) {
                        setError((err as Error).message);
                      }
                      setPutForward("");
                    });
                  }}
                  className="w-auto rounded-full bg-white py-0.5 pl-2 pr-6 text-[11px] text-muted ring-1 ring-line"
                >
                  <option value="">+ Also add to another show…</option>
                  {shows
                    .filter((x) => !work.shows.some((ws) => ws.showId === x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.open ? " (open)" : ""}
                      </option>
                    ))}
                </select>
              )}
              {owner && work.shows.length > 0 && (
                <select
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    const [from, to] = e.target.value.split("|");
                    if (!from || !to) return;
                    const toName = shows.find((x) => x.id === to)?.name ?? to;
                    startTransition(async () => {
                      try {
                        await moveWorksToShow(from, to, [work.id]);
                        const already = work.shows.some((x) => x.showId === to);
                        const moved = work.shows.find((x) => x.showId === from)!;
                        setWork({ ...work, shows: already ? work.shows.filter((x) => x.showId !== from) : work.shows.map((x) => (x.showId === from ? { ...moved, showId: to, name: toName } : x)) });
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    });
                  }}
                  className="w-auto rounded-full bg-white py-0.5 pl-2 pr-6 text-[11px] text-muted ring-1 ring-line"
                >
                  <option value="">Move to another show…</option>
                  {work.shows.map((from) => (
                    <optgroup key={from.showId} label={`From ${from.name}`}>
                      {shows
                        .filter((x) => x.id !== from.showId)
                        .map((x) => (
                          <option key={x.id} value={`${from.showId}|${x.id}`}>
                            {x.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
            {changes.length > 0 && (
              <p className="mt-1 text-[11px] text-muted">
                {changes.some((c) => c.field === "priceUsd") && <span className="text-amber-800">Price changed · </span>}
                Last edit {when(changes[0].at)} {who(changes[0])}
              </p>
            )}
            {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
          </>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {field("title", "Title", "col-span-4")}
            {field("year", "Year", "col-span-2")}
            {field("medium", "Medium (as written)", "col-span-4")}
            {field("category", "Category", "col-span-2")}
            {field("height", "Height", "col-span-1")}
            {field("width", "Width", "col-span-1")}
            {field("depth", "Depth", "col-span-1")}
            <label className="col-span-1 text-xs text-muted">
              Unit
              <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line">
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </label>
            {field("price", "Price (USD)", "col-span-2")}
            <label className="col-span-6 text-xs text-muted">
              Description
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-0.5 h-20 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line" />
            </label>
            <label className="col-span-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.sold} onChange={(e) => setDraft({ ...draft, sold: e.target.checked ? "yes" : "" })} />
              Sold <span className="text-xs text-muted">(sold works can&rsquo;t be put forward for new shows)</span>
            </label>
            <label className="col-span-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.archived} onChange={(e) => setDraft({ ...draft, archived: e.target.checked ? "yes" : "" })} />
              Archived <span className="text-xs text-muted">(hidden from the artist&rsquo;s open calls, kept on file; can be sold too)</span>
            </label>
            <div className="col-span-6 flex items-center gap-2">
              {error && <span className="text-xs text-rose-700">{error}</span>}
              <button onClick={() => setEditing(false)} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
                Cancel
              </button>
              <button onClick={save} disabled={pending} className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-50">
                {pending ? "Saving…" : "Save work"}
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** A work opened large: every photo on the left, its details on the right. Esc or a click outside closes it. */
function WorkViewer({ work, artistName, changes, onClose }: { work: Work; artistName: string; changes: Change[]; onClose: () => void }) {
  type Photo = Awaited<ReturnType<typeof getWorkPhotos>>[number];
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let live = true;
    getWorkPhotos(work.id)
      .then((p) => live && setPhotos(p))
      .catch(() => live && setFailed(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      else if (e.key === "ArrowRight" && count.current > 1) setIdx((i) => (i + 1) % count.current);
      else if (e.key === "ArrowLeft" && count.current > 1) setIdx((i) => (i - 1 + count.current) % count.current);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [work.id]);
  const ratio = work.width && work.height ? work.width / work.height : null;
  const shown = photos ?? (work.image ? [{ ...work.image, position: 0 }] : []);
  const [idx, setIdx] = useState(0);
  const at = shown.length ? Math.min(idx, shown.length - 1) : 0;
  const current = shown[at];
  const count = useRef(0);
  count.current = shown.length;
  const go = (step: number) => setIdx((i) => (count.current ? (i + step + count.current) % count.current : 0));
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 md:flex-row" onClick={onClose}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-4 md:p-6">
        {current ? (
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={current.id} src={current.full ?? current.thumb ?? undefined} alt={work.title} className="block max-h-[40vh] max-w-full object-contain md:max-h-[calc(100vh-10rem)]" />
            {shown.length > 1 && (
              <>
                <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70">
                  ‹
                </button>
                <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70">
                  ›
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="w-[80vw] md:w-[40vw]" onClick={(e) => e.stopPropagation()}>
            <ArtworkImage title={work.title} fallbackRatio={ratio} />
          </div>
        )}
        {shown.length > 1 && (
          <div className="flex max-w-full shrink-0 gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
            {shown.map((img, i) => (
              <button
                key={img.id}
                onClick={() => setIdx(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded ring-2 ${i === at ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb ?? img.full ?? undefined} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {shown.length > 1 && <p className="shrink-0 text-xs text-white/60">Photo {at + 1} of {shown.length}</p>}
        {!photos && !failed && work.image && <p className="shrink-0 text-xs text-white/60">Loading full-size photos…</p>}
        {failed && <p className="shrink-0 text-xs text-white/60">Couldn&rsquo;t load the full-size photos. Showing the preview.</p>}
      </div>
      <aside className="max-h-[50vh] w-full shrink-0 overflow-y-auto bg-paper p-5 md:max-h-none md:w-96 md:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="float-right text-sm text-muted">
          Close ✕
        </button>
        <p className="text-sm text-muted">{artistName}</p>
        <h2 className="font-display text-2xl">{work.title}</h2>
        <p className="mt-1 text-sm text-muted">{[work.year, work.medium].filter(Boolean).join(" · ")}</p>
        {(work.sold || work.archived) && (
          <div className="mt-2 flex gap-1.5 text-[11px]">
            {work.sold && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 ring-1 ring-emerald-200">Sold</span>}
            {work.archived && <span className="rounded bg-white px-1.5 py-0.5 text-muted ring-1 ring-line">{work.archivedByArtist ? "Archived by artist" : "Archived"}</span>}
          </div>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {row("Price", formatPrice(work.price))}
          {row(
            "Size",
            <>
              {formatSize(work)}
              {work.sizeAsEntered && work.width && work.height && <span className="block text-xs text-muted">Entered as &ldquo;{work.sizeAsEntered}&rdquo;</span>}
            </>,
          )}
          {row("Category", work.category ?? "Not given")}
          {row("Submitted", work.submittedOn ?? "Unknown")}
        </dl>
        {work.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{work.description}</p>}
        <div className="mt-6">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Shows</p>
          {work.shows.length ? (
            <ul className="space-y-1 text-sm">
              {work.shows.map((x) => (
                <li key={x.showId} className="flex items-center justify-between gap-2">
                  <span>{x.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATUS_TONE[x.status as keyof typeof STATUS_TONE] ?? "ring-line"}`}>{x.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not part of any show yet.</p>
          )}
        </div>
        {changes.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Changes</p>
            <ul className="space-y-1 text-xs text-muted">
              {changes.slice(0, 12).map((c) => (
                <li key={c.id}>
                  {describeChange(c)} {who(c)} · {when(c.at)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-8 text-xs text-muted">Use ← → to see other photos. Press Esc or click outside to close.</p>
      </aside>
    </div>
  );
}

function ArtistNotes({ artistId, notes: initial, works }: { artistId: string; notes: Profile["notes"]; works: Work[] }) {
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();
  const titleOf = new Map(works.map((w) => [w.id, w.title]));
  const add = () => {
    const body = draft.trim();
    if (!body) return;
    setNotes([{ id: -Date.now(), body, kind: "note", workId: null, createdAt: new Date().toISOString() }, ...notes]);
    setDraft("");
    startTransition(() => addNote(artistId, body));
  };
  const own = notes.filter((n) => n.kind === "note");
  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wider text-muted">Curator notes</h2>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && add()}
        placeholder="Only ARRAE can see this."
        className="mt-2 h-20 w-full rounded-md bg-white p-2 text-sm ring-1 ring-line"
      />
      <button onClick={add} disabled={!draft.trim()} className="mt-1 rounded-md bg-ink px-3 py-1 text-sm text-white disabled:opacity-40">
        Save note
      </button>
      <ul className="mt-3 space-y-3 text-sm">
        {own.map((n) => (
          <li key={n.id}>
            <p className="text-[11px] text-muted">
              {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {n.workId ? ` · on “${titleOf.get(n.workId) ?? "a work"}”` : ""}
            </p>
            <p className="whitespace-pre-line">{n.body}</p>
          </li>
        ))}
      </ul>
      {notes.some((n) => n.kind !== "note") && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted">History</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {notes
              .filter((n) => n.kind !== "note")
              .map((n) => (
                <li key={n.id}>
                  {new Date(n.createdAt).toLocaleDateString()} · {n.body}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
