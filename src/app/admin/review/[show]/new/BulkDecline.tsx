"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardEntry } from "@/lib/queries";
import { declineBatch, finishDecline, sendDeclineTest, type DeclineEmail } from "./actions";

const draftKey = (showId: string) => `decline-draft:${showId}`;

/** A warm starting point. {first_name} becomes each artist's own first name. */
function defaultEmail(showName: string): DeclineEmail {
  return {
    subject: `Your ${showName} application`,
    message: [
      "Hi {first_name},",
      `Thank you so much for applying to ARRAE ${showName} and for sharing your work with us. We truly enjoyed spending time with it.`,
      `We received far more wonderful applications than we have wall space for, and after a lot of careful thought we aren't able to include your work in ${showName}. This was a hard decision, and it is not a reflection of the quality of your work.`,
      "We would love for you to apply again for a future show. Your ARRAE studio stays open, so your profile and works are ready whenever the next call opens, and we'll let you know when it does.",
      "Thank you again for thinking of ARRAE. We hope to see you at the gallery soon.",
      "Warmly,\nThe ARRAE team",
    ].join("\n\n"),
  };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const fill = (t: string, name: string) => t.replace(/\{\s*first_name\s*\}/gi, firstName(name)).replace(/\{\s*name\s*\}/gi, name);

type Warn = (e: BoardEntry) => string | null;

/**
 * Decline (and/or email) several first-time applicants at once. Nothing happens until the last
 * button; the email can be previewed and tested on yourself first.
 */
export function BulkDecline({
  show,
  chosen,
  warn,
  onClose,
  onDone,
}: {
  show: { id: string; name: string; released: boolean };
  chosen: BoardEntry[];
  /** Why someone ticked may not belong here (in the sandbox, on the waitlist…), or null. */
  warn: Warn;
  onClose: () => void;
  onDone: (artistIds: string[]) => void;
}) {
  const router = useRouter();
  const toDecline = chosen.filter((e) => e.application?.status !== "Not selected");
  const [decline, setDecline] = useState(toDecline.length > 0);
  const [withEmail, setWithEmail] = useState(true);
  const [email, setEmail] = useState<DeclineEmail>(() => defaultEmail(show.name));
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [sampleIdx, setSampleIdx] = useState(0);

  // Keep unsent wording on this computer, so a reload doesn't lose it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(show.id));
      if (raw) setEmail(JSON.parse(raw));
    } catch {}
  }, [show.id]);
  useEffect(() => {
    try {
      const d = defaultEmail(show.name);
      if (email.subject === d.subject && email.message === d.message) localStorage.removeItem(draftKey(show.id));
      else localStorage.setItem(draftKey(show.id), JSON.stringify(email));
    } catch {}
  }, [email, show.id, show.name]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const sample = chosen[Math.min(sampleIdx, chosen.length - 1)];
  const warnings = useMemo(() => chosen.map((e) => ({ e, w: warn(e) })).filter((x) => x.w), [chosen, warn]);
  const emailReady = !withEmail || (email.subject.trim() && email.message.trim());
  const nothing = !decline && !withEmail;

  const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const friendly = (m: string) =>
    /Server Action|unexpected response/i.test(m) ? "The page is out of date or the connection dropped. Reload the page and try again (nobody is emailed twice)." : m;

  function test() {
    setStatus(null);
    start(async () => {
      try {
        const me = unwrap(await sendDeclineTest(email, sample?.artist.id));
        setStatus({ ok: true, text: `Test sent to ${me}, written as ${sample?.artist.name} would get it.` });
      } catch (e) {
        setStatus({ ok: false, text: friendly((e as Error).message) });
      }
    });
  }

  function run() {
    setStatus(null);
    start(async () => {
      const appIds = chosen.map((e) => e.application!.id);
      const r = { declined: [] as string[], sent: [] as string[], already: [] as string[], noEmail: [] as string[], failed: [] as string[] };
      let firstError: string | null = null;
      try {
        for (let i = 0; i < appIds.length; i += 5) {
          setProgress(`Working… ${Math.min(i, appIds.length)} of ${appIds.length} done`);
          const b = unwrap(await declineBatch(show.id, appIds.slice(i, i + 5), decline, withEmail ? email : null));
          r.declined.push(...b.declined);
          r.sent.push(...b.sent);
          r.already.push(...b.already);
          r.noEmail.push(...b.noEmail);
          r.failed.push(...b.failed);
          firstError ??= b.firstError;
        }
      } catch (e) {
        firstError = friendly((e as Error).message);
      } finally {
        setProgress("");
      }
      await finishDecline(show.id, r.declined.length, r.sent.length).catch(() => {});
      setConfirming(false);
      router.refresh();
      const parts: string[] = [];
      if (decline) parts.push(`Declined ${r.declined.length}${toDecline.length !== r.declined.length ? ` of ${toDecline.length}` : ""}.`);
      if (withEmail) parts.push(`Emailed ${r.sent.length} of ${chosen.length}.`);
      if (r.already.length) parts.push(`Already had this email, so not sent again: ${r.already.join(", ")}.`);
      if (r.noEmail.length) parts.push(`No valid email address on file: ${r.noEmail.join(", ")}.`);
      if (r.failed.length || firstError)
        parts.push(`Didn't go through${r.failed.length ? `: ${r.failed.join(", ")}` : ""}${firstError ? ` (${firstError})` : ""}. Press the button again to retry; nobody is emailed twice.`);
      const ok = !r.failed.length && !firstError;
      setStatus({ ok, text: parts.join(" ") });
      if (ok) {
        localStorage.removeItem(draftKey(show.id));
        onDone(chosen.map((e) => e.artist.id));
      }
    });
  }

  const action = [decline ? `Decline ${toDecline.length}` : null, withEmail ? `email ${chosen.length}` : null].filter(Boolean).join(" and ");
  const done = status?.ok;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => !pending && onClose()}>
      <div className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl ring-1 ring-line md:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{show.name} · first-time applicants</p>
            <h2 className="font-display text-3xl">
              {chosen.length} applicant{chosen.length === 1 ? "" : "s"} ticked
            </h2>
          </div>
          <button onClick={onClose} disabled={pending} className="text-sm text-muted">
            Close ✕
          </button>
        </div>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {chosen.map((e) => (
            <li key={e.artist.id} className={`rounded-full px-2.5 py-1 text-xs ring-1 ${warn(e) ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-paper ring-line"}`}>
              {e.artist.name}
            </li>
          ))}
        </ul>
        {warnings.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-medium">Check before you go on:</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map(({ e, w }) => (
                <li key={e.artist.id}>
                  {e.artist.name}: {w}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Close this and untick them if they shouldn't be declined.</p>
          </div>
        )}

        {done ? (
          <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
            <p>{status!.text}</p>
            <button onClick={onClose} className="mt-3 rounded-md bg-ink px-4 py-2 text-sm text-white">
              Done
            </button>
          </div>
        ) : (
          <>
            <section className="mt-6 space-y-3">
              <label className={`flex items-start gap-3 rounded-lg p-3 ring-1 ${decline ? "bg-rose-50/50 ring-rose-200" : "ring-line"}`}>
                <input type="checkbox" className="mt-1 h-4 w-4" checked={decline} disabled={!toDecline.length} onChange={(e) => setDecline(e.target.checked)} />
                <span>
                  <span className="font-medium">
                    1. Move {toDecline.length ? `${toDecline.length} of them` : "them"} to Decline
                  </span>
                  <span className="block text-sm text-muted">
                    {toDecline.length
                      ? `${show.released ? "Right away, they'll" : "Once you release decisions, they'll"} see “Not selected for ${show.name}, we hope you'll apply again” in their ARRAE studio.`
                      : "Everyone ticked is already in Decline."}
                    {toDecline.length > 0 && toDecline.length < chosen.length ? ` ${chosen.length - toDecline.length} already are.` : ""}
                  </span>
                </span>
              </label>

              <label className={`flex items-start gap-3 rounded-lg p-3 ring-1 ${withEmail ? "bg-sky-50/50 ring-sky-200" : "ring-line"}`}>
                <input type="checkbox" className="mt-1 h-4 w-4" checked={withEmail} onChange={(e) => setWithEmail(e.target.checked)} />
                <span>
                  <span className="font-medium">2. Send each of them this email</span>
                  <span className="block text-sm text-muted">
                    One separate email per artist, from hello@arraegallery.com, with their own first name. Replies go to hello@. Each one is kept on the artist's history.
                  </span>
                </span>
              </label>
            </section>

            {withEmail && (
              <section className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted">Subject</label>
                  <input
                    value={email.subject}
                    onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                    className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line"
                  />
                  <label className="mt-3 block text-xs uppercase tracking-wider text-muted">Message</label>
                  <textarea
                    value={email.message}
                    onChange={(e) => setEmail({ ...email, message: e.target.value })}
                    className="mt-1 h-80 w-full rounded-md bg-white p-3 text-sm leading-relaxed ring-1 ring-line"
                  />
                  <p className="mt-1 text-xs text-muted">
                    Write {"{first_name}"} where their first name goes. Your wording is kept on this computer until it's sent.{" "}
                    <button className="underline" onClick={() => setEmail(defaultEmail(show.name))}>
                      Start over from the suggested wording
                    </button>
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted">
                    <span>Preview</span>
                    {chosen.length > 1 && (
                      <span className="flex items-center gap-1 normal-case tracking-normal">
                        <button onClick={() => setSampleIdx((i) => Math.max(0, i - 1))} disabled={sampleIdx <= 0} className="rounded px-1.5 ring-1 ring-line disabled:opacity-30">
                          ←
                        </button>
                        {sampleIdx + 1} of {chosen.length}
                        <button
                          onClick={() => setSampleIdx((i) => Math.min(chosen.length - 1, i + 1))}
                          disabled={sampleIdx >= chosen.length - 1}
                          className="rounded px-1.5 ring-1 ring-line disabled:opacity-30"
                        >
                          →
                        </button>
                      </span>
                    )}
                  </div>
                  {sample && (
                    <div className="mt-1 rounded-lg bg-paper p-4 text-sm ring-1 ring-line">
                      <p className="text-xs text-muted">To: {sample.artist.email || "no email on file"}</p>
                      <p className="mt-1 font-medium">{fill(email.subject, sample.artist.name)}</p>
                      <div className="mt-3 whitespace-pre-line leading-relaxed">{fill(email.message, sample.artist.name)}</div>
                    </div>
                  )}
                  <button onClick={test} disabled={pending || !emailReady} className="mt-3 rounded-md px-3 py-1.5 text-sm ring-1 ring-line hover:bg-paper disabled:opacity-40">
                    Send me a test first
                  </button>
                </div>
              </section>
            )}

            {status && !status.ok && <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{status.text}</p>}
            {status?.ok === true && !done && <p className="mt-4 text-sm text-emerald-800">{status.text}</p>}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
              {progress && <span className="text-sm text-muted">{progress}</span>}
              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={nothing || !emailReady || pending}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {nothing ? "Choose 1, 2 or both" : `${action[0].toUpperCase()}${action.slice(1)}…`}
                </button>
              ) : (
                <>
                  <span className="text-sm">
                    Sure? {decline && toDecline.length ? `${toDecline.length} will be declined` : ""}
                    {decline && toDecline.length && withEmail ? " and " : ""}
                    {withEmail ? `${chosen.length} email${chosen.length === 1 ? "" : "s"} will go out` : ""}. Emails can't be unsent.
                  </span>
                  <button onClick={() => setConfirming(false)} disabled={pending} className="rounded-md px-3 py-2 text-sm ring-1 ring-line">
                    Cancel
                  </button>
                  <button onClick={run} disabled={pending} className="rounded-md bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-40">
                    Yes, {action.toLowerCase()}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
