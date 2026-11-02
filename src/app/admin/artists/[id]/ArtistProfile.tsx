"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addNote, updateArtist, updateWork } from "../../actions";
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

const ONBOARDING = [
  ["agreement", "Agreement signed"],
  ["w9", "W-9 received"],
  ["dropoffScheduled", "Drop-off scheduled"],
  ["meetGreet", "Meet & greet"],
  ["coaRequested", "COA requested"],
] as const;

export function ArtistProfile({ profile }: { profile: Profile }) {
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
  const [onboarding, setOnboarding] = useState<Record<string, boolean | string>>(a.onboarding ?? {});
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
  function toggleOnboarding(key: string) {
    const next = { ...onboarding, [key]: !onboarding[key] };
    setOnboarding(next);
    startTransition(() => updateArtist(a.id, { onboarding: next }));
  }

  const input = "w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line focus:ring-ink";
  return (
    <main className="mx-auto max-w-6xl px-4 pb-32">
      <section className="py-6">
        <Link href="/admin/artists" className="text-sm text-muted hover:underline">
          ← All artists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">{saved.name}</h1>
          {profile.onWaitlist && <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE.Waitlist}`}>On waitlist</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {profile.applications.map((ap) => (
            <Link
              key={ap.id}
              href={ap.showId ? `/admin/review/${ap.showId}` : "#"}
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
                <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} />
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
              onChange={(e) => setForm({ ...form, arraeBio: e.target.value })}
              placeholder="Your standardized bio, in ARRAE's voice. This is the one that goes to Shopify."
              className={`${input} mt-1 h-48 leading-relaxed`}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted">Artist's own bio / statement (as they submitted it)</span>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={`${input} mt-1 h-40 leading-relaxed`} />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted">Internal notes (private)</span>
            <textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} className={`${input} mt-1 h-28`} />
          </label>

          <div>
            <h2 className="text-xs uppercase tracking-wider text-muted">Onboarding</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {ONBOARDING.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => toggleOnboarding(k)}
                  className={`rounded-full px-3 py-1 text-xs ring-1 ${onboarding[k] ? STATUS_TONE.Selected : "bg-white ring-line"}`}
                >
                  {onboarding[k] ? "✓ " : ""}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted">Works ({profile.works.length})</h2>
          <ul className="mt-3 space-y-3">
            {profile.works.map((w) => (
              <WorkRow key={w.id} work={w} />
            ))}
          </ul>
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

function WorkRow({ work: initial }: { work: Work }) {
  const [work, setWork] = useState(initial);
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
    });
    setEditing(true);
  };
  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        await updateWork(work.id, draft);
        const n = (v: string) => (v.trim() ? Number(v.replace(/[$,]/g, "")) : null);
        setWork({ ...work, ...draft, price: n(draft.price), width: n(draft.width), height: n(draft.height), depth: n(draft.depth) });
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
      <div className="w-24 shrink-0 overflow-hidden rounded">
        <ArtworkImage image={work.image ?? undefined} title={work.title} fallbackRatio={work.width && work.height ? work.width / work.height : null} />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {!editing ? (
          <>
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <p className="font-medium">{work.title}</p>
                <p className="text-xs text-muted">
                  {[work.year, work.medium].filter(Boolean).join(" · ")}
                  {work.year || work.medium ? " · " : ""}
                  {formatSize(work)} · {formatPrice(work.price)}
                  {work.sold ? " · Sold" : ""}
                </p>
              </div>
              <button onClick={start} className="ml-auto shrink-0 text-xs text-muted hover:underline">
                Edit
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {work.shows.map((s) => (
                <span key={s.showId} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATUS_TONE[s.status] ?? STATUS_TONE.Submitted}`}>
                  {s.name}: {s.status}
                </span>
              ))}
            </div>
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
