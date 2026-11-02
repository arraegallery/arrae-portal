"use client";

import { useMemo, useState, useTransition } from "react";
import { sendMessageToArtists, sendTestMessage } from "../actions";
import { personalize, renderEmail } from "@/lib/email";

type Artist = { id: string; name: string; email: string; roster: boolean; onWaitlist: boolean; appliedTo: string[]; selectedFor: string[] };
type Show = { id: string; name: string; type: string };
type Sent = { id: number; body: string; actor: string | null; at: string };

type Audience = "roster" | "everyone" | "waitlist" | "none";

export function MessageComposer({ artists, shows, history, me, configured }: { artists: Artist[]; shows: Show[]; history: Sent[]; me: string; configured: boolean }) {
  const [audience, setAudience] = useState<Audience>("roster");
  const [showId, setShowId] = useState("");
  const [showScope, setShowScope] = useState<"selected" | "applied">("selected");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("Hi {first_name},\n\n");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(artists.map((a) => [a.id, a])), [artists]);
  const matches = useMemo(
    () =>
      artists.filter((a) => {
        if (audience === "none") return false;
        if (audience === "roster" && !a.roster) return false;
        if (audience === "waitlist" && !a.onWaitlist) return false;
        if (showId && !(showScope === "selected" ? a.selectedFor : a.appliedTo).includes(showId)) return false;
        return true;
      }),
    [artists, audience, showId, showScope],
  );
  const matchIds = new Set(matches.map((a) => a.id));
  const extras = [...added].filter((id) => !matchIds.has(id)).map((id) => byId.get(id)!).filter(Boolean);
  const listed = [...matches, ...extras];
  const chosen = listed.filter((a) => !excluded.has(a.id));
  const needle = q.trim().toLowerCase();
  const searchHits = needle
    ? artists.filter((a) => !listed.some((l) => l.id === a.id) && (a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle))).slice(0, 8)
    : [];

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const message = { subject, heading, body, buttonLabel, buttonUrl };
  const sample = chosen[0]?.name ?? "Artist";
  const previewHtml = renderEmail({ ...message, subject: personalize(subject, sample), heading: personalize(heading, sample), body: personalize(body || " ", sample) });
  const ready = subject.trim() && body.trim().replace(/^Hi \{first_name\},$/, "").trim();

  const test = () =>
    start(async () => {
      setStatus(null);
      try {
        const to = await sendTestMessage(message, chosen[0]?.id);
        setStatus({ ok: true, text: `Test sent to ${to}. Check your inbox.` });
      } catch (e) {
        setStatus({ ok: false, text: (e as Error).message });
      }
    });
  const send = () =>
    start(async () => {
      setStatus(null);
      try {
        const r = await sendMessageToArtists(
          chosen.map((a) => a.id),
          message,
        );
        setConfirming(false);
        const parts = [`Sent to ${r.sent} artist${r.sent === 1 ? "" : "s"}.`];
        if (r.failed) parts.push(`${r.failed} didn't go through (${r.firstError}).`);
        if (r.skipped.length) parts.push(`Skipped (missing or shared email): ${r.skipped.join(", ")}.`);
        setStatus({ ok: !r.failed, text: parts.join(" ") });
        if (r.sent && !r.failed) {
          setSubject("");
          setHeading("");
          setBody("Hi {first_name},\n\n");
          setButtonLabel("");
          setButtonUrl("");
        }
      } catch (e) {
        setConfirming(false);
        setStatus({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Message artists</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Each artist gets their own copy in the ARRAE email design, from hello@arraegallery.com, so nobody sees anyone else's address. Replies come back to hello@arraegallery.com.
        </p>
      </section>

      {!configured && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Sending isn't switched on yet. Add a Resend API key named <code>RESEND_API_KEY</code> in Vercel, then redeploy. You can still write and preview a message.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Recipients */}
        <section className="rounded-lg bg-white p-4 ring-1 ring-line">
          <h2 className="font-display text-xl">Who gets it</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {(
              [
                ["roster", "Roster artists"],
                ["everyone", "Everyone"],
                ["waitlist", "Waitlist"],
                ["none", "Only people I pick"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} onClick={() => setAudience(v)} className={`rounded-full px-3 py-1 ring-1 ${audience === v ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
                {label}
              </button>
            ))}
          </div>
          {audience !== "none" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <select value={showId} onChange={(e) => setShowId(e.target.value)} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line">
                <option value="">Any show</option>
                {shows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {showId && (
                <select value={showScope} onChange={(e) => setShowScope(e.target.value as "selected" | "applied")} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line">
                  <option value="selected">Selected for this show</option>
                  <option value="applied">Everyone who applied</option>
                </select>
              )}
            </div>
          )}

          <div className="relative mt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add someone by name or email" className="w-full rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" />
            {searchHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full divide-y divide-line rounded-md bg-white text-sm shadow ring-1 ring-line">
                {searchHits.map((a) => (
                  <li key={a.id}>
                    <button
                      className="flex w-full gap-2 px-3 py-2 text-left hover:bg-paper"
                      onClick={() => {
                        setAdded((p) => new Set(p).add(a.id));
                        setExcluded((p) => {
                          const n = new Set(p);
                          n.delete(a.id);
                          return n;
                        });
                        setQ("");
                      }}
                    >
                      <span>{a.name}</span>
                      <span className="truncate text-muted">{a.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              <strong>{chosen.length}</strong> of {listed.length} will get it
            </span>
            <span className="flex gap-3 text-muted">
              <button className="underline" onClick={() => setExcluded(new Set())}>
                All
              </button>
              <button className="underline" onClick={() => setExcluded(new Set(listed.map((a) => a.id)))}>
                None
              </button>
            </span>
          </div>
          <ul className="mt-2 max-h-[28rem] divide-y divide-line overflow-y-auto rounded-md ring-1 ring-line">
            {listed.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nobody yet. Pick a group or add someone above.</li>}
            {listed.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-paper">
                  <input type="checkbox" checked={!excluded.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="font-medium">{a.name}</span>
                  <span className="truncate text-muted">{a.email}</span>
                  {added.has(a.id) && !matchIds.has(a.id) && <span className="ml-auto shrink-0 text-xs text-muted">added</span>}
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Compose and preview */}
        <section className="space-y-4">
          <div className="space-y-3 rounded-lg bg-white p-4 ring-1 ring-line">
            <h2 className="font-display text-xl">Message</h2>
            <label className="block text-sm">
              <span className="text-muted">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-line" placeholder="Volume IV: a few dates to save" />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Heading in the email (optional)</span>
              <input value={heading} onChange={(e) => setHeading(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-line" placeholder="Save the date" />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Message</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="mt-1 w-full rounded-md px-3 py-2 font-sans ring-1 ring-line" />
              <span className="mt-1 block text-xs text-muted">
                Write <code>{"{first_name}"}</code> or <code>{"{name}"}</code> and each artist sees their own. Leave a blank line between paragraphs. Links work as typed.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-muted">Button text (optional)</span>
                <input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-line" placeholder="See the details" />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Button link</span>
                <input value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-line" placeholder="https://arraegallery.com/..." />
              </label>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 ring-1 ring-line">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-xl">Preview</h2>
              <span className="text-xs text-muted">as {sample} will see it</span>
            </div>
            <p className="mb-2 text-sm">
              <span className="text-muted">Subject:</span> {personalize(subject, sample) || <em className="text-muted">no subject yet</em>}
            </p>
            <iframe title="Email preview" srcDoc={previewHtml} className="h-[34rem] w-full rounded-md ring-1 ring-line" sandbox="" />
          </div>

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow ring-1 ring-line">
            {!confirming ? (
              <>
                <button disabled={!configured || !ready || pending} onClick={test} className="rounded-md px-4 py-2 text-sm ring-1 ring-line disabled:opacity-40">
                  Send a test to me
                </button>
                <button disabled={!configured || !ready || !chosen.length || pending} onClick={() => setConfirming(true)} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
                  Send to {chosen.length} artist{chosen.length === 1 ? "" : "s"}
                </button>
                <span className="text-xs text-muted">The test goes to {me}.</span>
              </>
            ) : (
              <>
                <span className="text-sm">
                  Send &ldquo;{subject}&rdquo; to <strong>{chosen.length}</strong> artist{chosen.length === 1 ? "" : "s"} now? This can&apos;t be undone.
                </span>
                <button disabled={pending} onClick={send} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
                  {pending ? "Sending…" : "Yes, send"}
                </button>
                <button disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-4 py-2 text-sm ring-1 ring-line">
                  Cancel
                </button>
              </>
            )}
            {status && <p className={`w-full text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`}>{status.text}</p>}
          </div>

          {history.length > 0 && (
            <div className="rounded-lg bg-white p-4 ring-1 ring-line">
              <h2 className="font-display text-xl">Sent before</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-4 py-2">
                    <span>{h.body}</span>
                    <span className="shrink-0 text-muted">{new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
