"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Prose } from "@/components/Prose";
import { saveApplicationTerms } from "../actions";

type Signup = { email: string; started: string; agreed: boolean; submitted: string | null; artistId: string | null; showId: string | null };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export function ApplicationSettings({ applyUrl, terms, custom, signups, showNames }: { applyUrl: string; terms: string; custom: boolean; signups: Signup[]; showNames: Record<string, string> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(terms);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (text: string | null) =>
    start(async () => {
      setError(null);
      try {
        await saveApplicationTerms(text);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const unfinished = signups.filter((x) => !x.submitted);
  const shown = filter === "open" ? unfinished : signups;
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-24">
      <section className="rounded-lg bg-white p-4 ring-1 ring-line">
        <h2 className="font-display text-2xl">Applications</h2>
        <p className="mt-1 text-sm text-muted">
          Artists apply at this link: email first, then your terms, then the form. Only shows that are open to submissions appear in its dropdown.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input readOnly value={applyUrl} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md bg-paper px-2 py-1.5 font-mono text-xs ring-1 ring-line" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(applyUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-white"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={applyUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-xs ring-1 ring-line">
            Open
          </a>
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Terms artists read before applying</h2>
          {!editing && (
            <button onClick={() => (setDraft(terms), setEditing(true))} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
              Edit terms
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-3">
            <p className="text-xs text-muted">
              Blank line = new paragraph. <code>## </code> at the start of a line = heading. <code>**bold**</code>, <code>_italic_</code>, <code>- </code> for bullets. When you save new wording, anyone
              who hasn&rsquo;t applied yet is asked to agree again.
            </p>
            <div className="mt-2 flex gap-2 text-xs">
              <button onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ring-1 ${!preview ? "bg-ink text-white ring-ink" : "ring-line"}`}>
                Write
              </button>
              <button onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ring-1 ${preview ? "bg-ink text-white ring-ink" : "ring-line"}`}>
                Preview
              </button>
            </div>
            {preview ? (
              <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-md bg-paper p-4 ring-1 ring-line">
                <Prose text={draft} />
              </div>
            ) : (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 h-[60vh] w-full rounded-md bg-white p-3 font-mono text-xs ring-1 ring-line" />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {error && <span className="text-sm text-rose-700">{error}</span>}
              {custom && (
                <button disabled={pending} onClick={() => confirm("Go back to the original terms from your Airtable form?") && save(null)} className="text-xs text-muted underline">
                  Use the original wording
                </button>
              )}
              <button onClick={() => setEditing(false)} className="ml-auto rounded-md px-3 py-1.5 text-sm ring-1 ring-line">
                Cancel
              </button>
              <button disabled={pending || !draft.trim()} onClick={() => save(draft)} className="rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-40">
                {pending ? "Saving…" : "Save terms"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-md bg-paper p-4 ring-1 ring-line">
            <Prose text={terms} />
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">People who started an application</h2>
          <button onClick={() => setFilter("open")} className={`ml-auto rounded-full px-3 py-1 text-xs ring-1 ${filter === "open" ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
            Not finished ({unfinished.length})
          </button>
          <button onClick={() => setFilter("all")} className={`rounded-full px-3 py-1 text-xs ring-1 ${filter === "all" ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
            Everyone ({signups.length})
          </button>
        </div>
        <ul className="mt-2 divide-y divide-line rounded-lg bg-white text-sm ring-1 ring-line">
          {shown.map((x) => (
            <li key={x.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="font-medium">{x.email}</span>
              <span className="text-xs text-muted">started {when(x.started)}</span>
              <span className="ml-auto text-xs">
                {x.submitted ? (
                  x.artistId ? (
                    <Link href={`/admin/artists/${x.artistId}`} className="text-emerald-800 underline">
                      Applied{x.showId ? ` to ${showNames[x.showId] ?? x.showId}` : ""} {when(x.submitted)}
                    </Link>
                  ) : (
                    <span className="text-emerald-800">Applied {when(x.submitted)}</span>
                  )
                ) : x.agreed ? (
                  <span className="text-amber-800">Read the terms, hasn&rsquo;t sent the form</span>
                ) : (
                  <span className="text-muted">Gave their email, hasn&rsquo;t read the terms yet</span>
                )}
              </span>
            </li>
          ))}
          {!shown.length && <li className="px-4 py-3 text-muted">No one yet.</li>}
        </ul>
      </section>
    </div>
  );
}
