"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { renderEmail } from "@/lib/email";
import { buildWelcome, type WelcomeArtist, type WelcomeDropoff, type WelcomeGroup, type WelcomeShow, type WelcomeTemplates } from "@/lib/welcome";
import { finishWelcome, saveWelcome, sendWelcomeBatch, testWelcome } from "./actions";

const input = "mt-1 w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export function NotifyBoard({
  show,
  released,
  dropoff,
  dropoffOpen,
  artists,
  templates: initial,
  studioUrl,
  me,
  configured,
}: {
  show: WelcomeShow;
  released: boolean;
  dropoff: WelcomeDropoff;
  dropoffOpen: boolean;
  artists: WelcomeArtist[];
  templates: WelcomeTemplates;
  studioUrl: string;
  me: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [group, setGroup] = useState<WelcomeGroup>("returning");
  const [templates, setTemplates] = useState(initial);
  // Everyone not yet emailed starts ticked.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(artists.filter((a) => !a.sentAt).map((a) => a.id)));
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const list = artists.filter((a) => a.group === group);
  const chosen = list.filter((a) => picked.has(a.id));
  const sample = list.find((a) => a.id === sampleId) ?? chosen[0] ?? list[0] ?? null;
  const t = templates[group];
  const setT = (k: keyof typeof t, v: string) => setTemplates({ ...templates, [group]: { ...t, [k]: v } });
  const email = useMemo(() => (sample ? buildWelcome(t, templates.requirements, show, sample, dropoff, studioUrl) : null), [t, templates.requirements, show, sample, dropoff, studioUrl]);
  const counts = { returning: artists.filter((a) => a.group === "returning").length, new: artists.filter((a) => a.group === "new").length };
  const sentCount = list.filter((a) => a.sentAt).length;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const [progress, setProgress] = useState("");
  const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const sendAll = async () => {
    const ids = chosen.map((a) => a.id);
    const sent: string[] = [];
    const skipped: string[] = [];
    const already: string[] = [];
    let firstError: string | null = null;
    try {
      // A few at a time, so one slow moment can't time out the whole send.
      for (let i = 0; i < ids.length; i += 5) {
        setProgress(`Sending… ${sent.length} of ${ids.length} sent`);
        const r = unwrap(await sendWelcomeBatch(show.id, group, ids.slice(i, i + 5), templates));
        sent.push(...r.sent);
        skipped.push(...r.skipped);
        already.push(...r.already);
        firstError ??= r.firstError;
      }
    } catch (e) {
      firstError = (e as Error).message;
    } finally {
      setProgress("");
    }
    const notSent = chosen.map((a) => a.name).filter((n) => !sent.includes(n) && !skipped.includes(n) && !already.includes(n));
    if (sent.length) await finishWelcome(show.id, group, sent.length, notSent.length);
    setConfirming(false);
    router.refresh();
    setPicked((p) => new Set([...p].filter((id) => !chosen.some((a) => a.id === id && (sent.includes(a.name) || already.includes(a.name))))));
    const parts = [`Sent to ${sent.length} of ${ids.length} artist${ids.length === 1 ? "" : "s"}.`];
    if (already.length) parts.push(`Already sent before, so skipped: ${already.join(", ")}.`);
    if (skipped.length) parts.push(`Skipped (no valid email): ${skipped.join(", ")}.`);
    if (notSent.length) {
      parts.push(`Not sent: ${notSent.join(", ")}${firstError ? ` (${firstError})` : ""}. They're still ticked, so you can press send again.`);
      throw new Error(parts.join(" "));
    }
    return parts.join(" ");
  };
  const run = (f: () => Promise<string | void>) =>
    start(async () => {
      setStatus(null);
      try {
        const text = await f();
        if (text) setStatus({ ok: true, text });
      } catch (e) {
        setStatus({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE · {show.name}</p>
        <h1 className="font-display text-4xl">Notify artists</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every artist with selected works in {show.name} gets their own email: a welcome back for returning artists, a welcome for first-time artists. Each one lists their selected works, the
          drop-off dates and what to bring, with a button to sign in and pick a drop-off time. Replies go to hello@arraegallery.com.
        </p>
      </section>

      <div className="mb-4 space-y-2 text-sm">
        <p className={`rounded-md px-3 py-2 ring-1 ${released ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
          {released
            ? `Decisions for ${show.name} are visible to artists.`
            : `Decisions for ${show.name} are still hidden from artists. Sending the first email releases them, so artists see their selected works and the drop-off calendar in their studio.`}
        </p>
        {!dropoff ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-900 ring-1 ring-rose-200">
            There are no drop-off times for {show.name} yet. Set them up on{" "}
            <Link href="/admin/logistics" className="underline">
              Logistics
            </Link>{" "}
            first.
          </p>
        ) : (
          !dropoffOpen && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
              The drop-off calendar is closed for booking. Open it on{" "}
              <Link href="/admin/logistics" className="underline">
                Logistics
              </Link>{" "}
              before you send, so artists can pick a time.
            </p>
          )
        )}
        {!configured && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">Sending isn&apos;t switched on (no RESEND_API_KEY). You can still write and preview.</p>}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["returning", `Returning artists (${counts.returning})`],
            ["new", `First-time artists (${counts.new})`],
          ] as const
        ).map(([g, label]) => (
          <button
            key={g}
            onClick={() => (setGroup(g), setSampleId(null), setConfirming(false), setStatus(null))}
            className={`rounded-full px-4 py-1.5 ring-1 ${group === g ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="rounded-lg bg-white p-4 ring-1 ring-line">
          <div className="flex items-baseline justify-between text-sm">
            <h2 className="font-display text-xl">Who gets it</h2>
            <span className="flex gap-3 text-muted">
              <button className="underline" onClick={() => setPicked((p) => new Set([...p, ...list.filter((a) => !a.sentAt).map((a) => a.id)]))}>
                Not sent yet
              </button>
              <button className="underline" onClick={() => setPicked((p) => new Set([...p].filter((id) => !list.some((a) => a.id === id))))}>
                None
              </button>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            <strong>{chosen.length}</strong> of {list.length} ticked{sentCount ? ` · ${sentCount} already sent` : ""}. Click a name to preview their email.
          </p>
          <ul className="mt-2 max-h-[40rem] divide-y divide-line overflow-y-auto rounded-md ring-1 ring-line">
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nobody in this group. Finalize the sandbox first.</li>}
            {list.map((a) => (
              <li key={a.id} className={`flex items-start gap-3 px-3 py-2 text-sm ${sample?.id === a.id ? "bg-paper" : ""}`}>
                <input type="checkbox" className="mt-1" checked={picked.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Send to ${a.name}`} />
                <button onClick={() => setSampleId(a.id)} className="min-w-0 flex-1 text-left">
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {a.works.length} work{a.works.length === 1 ? "" : "s"}
                  </span>
                  <span className="block truncate text-xs text-muted">{a.email || "No email on file"}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                    {!a.agreementSigned && <span className="rounded-full bg-amber-50 px-2 text-amber-900 ring-1 ring-amber-200">Agreement not signed</span>}
                    {a.sentAt && <span className="rounded-full bg-emerald-50 px-2 text-emerald-900 ring-1 ring-emerald-200">Sent {day(a.sentAt)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="space-y-3 rounded-lg bg-white p-4 ring-1 ring-line">
            <h2 className="font-display text-xl">{group === "new" ? "Welcome email" : "Welcome back email"}</h2>
            <p className="text-xs text-muted">
              {"{first_name}"}, {"{show}"}, {"{opens}"} and {"{closes}"} are filled in for each artist. Their works, the drop-off dates and the agreement note (only for artists who haven&apos;t signed) are
              added between the opening and the closing.
            </p>
            <label className="block text-xs text-muted">
              Subject
              <input value={t.subject} onChange={(e) => setT("subject", e.target.value)} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Heading in the email
              <input value={t.heading} onChange={(e) => setT("heading", e.target.value)} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Opening
              <textarea value={t.intro} onChange={(e) => setT("intro", e.target.value)} rows={7} className={input} />
            </label>
            <label className="block text-xs text-muted">
              What to bring (same for both emails)
              <textarea value={templates.requirements} onChange={(e) => setTemplates({ ...templates, requirements: e.target.value })} rows={5} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Closing
              <textarea value={t.closing} onChange={(e) => setT("closing", e.target.value)} rows={6} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Button text
              <input value={t.buttonLabel} onChange={(e) => setT("buttonLabel", e.target.value)} className={input} />
            </label>
          </div>

          <div className="rounded-lg bg-white p-4 ring-1 ring-line">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-xl">Preview</h2>
              <span className="text-xs text-muted">{sample ? `as ${sample.name} will see it` : ""}</span>
            </div>
            {email ? (
              <>
                <p className="mb-2 text-sm">
                  <span className="text-muted">To:</span> {sample?.email} · <span className="text-muted">Subject:</span> {email.subject}
                </p>
                <iframe title="Email preview" srcDoc={renderEmail(email)} className="h-[40rem] w-full rounded-md ring-1 ring-line" sandbox="allow-same-origin" />
              </>
            ) : (
              <p className="text-sm text-muted">Nobody to preview yet.</p>
            )}
          </div>

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow ring-1 ring-line">
            {!confirming ? (
              <>
                <button disabled={pending} onClick={() => run(async () => (unwrap(await saveWelcome(show.id, templates)), "Saved."))} className="rounded-md px-4 py-2 text-sm ring-1 ring-line disabled:opacity-40">
                  Save
                </button>
                <button
                  disabled={!configured || pending || !sample}
                  onClick={() => run(async () => `Test sent to ${unwrap(await testWelcome(show.id, group, templates, sample?.id))}. Check your inbox.`)}
                  className="rounded-md px-4 py-2 text-sm ring-1 ring-line disabled:opacity-40"
                >
                  Send a test to me
                </button>
                <button disabled={!configured || pending || !chosen.length || !dropoff} onClick={() => setConfirming(true)} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
                  {released ? "Send" : "Release decisions and send"} to {chosen.length} artist{chosen.length === 1 ? "" : "s"}
                </button>
                <span className="text-xs text-muted">The test goes to {me}.</span>
              </>
            ) : (
              <>
                <span className="text-sm">
                  {released ? "Send" : `Release ${show.name} decisions and send`} the {group === "new" ? "welcome" : "welcome back"} email to <strong>{chosen.length}</strong> artist
                  {chosen.length === 1 ? "" : "s"} now? This can&apos;t be undone.
                </span>
                <button
                  disabled={pending}
                  onClick={() => run(sendAll)}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {pending ? progress || "Sending…" : "Yes, send"}
                </button>
                <button disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-4 py-2 text-sm ring-1 ring-line">
                  Cancel
                </button>
              </>
            )}
          </div>
          {status && <p className={`rounded-md p-3 text-sm ring-1 ${status.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{status.text}</p>}
        </section>
      </div>
    </main>
  );
}
