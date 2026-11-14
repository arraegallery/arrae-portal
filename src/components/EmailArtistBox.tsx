"use client";

import { useState, useTransition } from "react";
import { emailArtist, stopMoreWorks } from "@/app/admin/actions";
import { MORE_WORKS, parseDirectEmail } from "@/lib/direct-email";
import type { ApplicationStatus } from "@/lib/status";
import type { BoardNote } from "@/lib/queries";

type App = { id: string; status: ApplicationStatus; extraWorksLeft: number };

/**
 * Write to one artist from the review page. It goes out from the portal in ARRAE's email
 * layout, replies land in hello@arraegallery.com, and each email sent is listed below.
 */
export function EmailArtistBox({
  artist,
  showId,
  showName,
  sent,
  onSent,
  application,
  onApplication,
  className = "",
}: {
  artist: { id: string; name: string; email: string };
  showId: string;
  showName: string;
  sent: BoardNote[];
  onSent: (entry: BoardNote) => void;
  /** This artist's application to the show, when they have one. */
  application?: App | null;
  onApplication?: (app: App) => void;
  className?: string;
}) {
  const first = artist.name.trim().split(/\s+/)[0] || artist.name;
  const [subject, setSubject] = useState(`Your ${showName} application`);
  const [message, setMessage] = useState(`Hi ${first},\n\n`);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [moreWorks, setMoreWorks] = useState(false);
  const accepted = application?.status === "Selected";
  const left = application?.extraWorksLeft ?? 0;
  const [pending, startTransition] = useTransition();
  const hasEmail = artist.email.includes("@");
  const ready = hasEmail && subject.trim() && message.trim() && message.trim() !== `Hi ${first},`;

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await emailArtist(artist.id, subject, message, showId, moreWorks);
        onSent(r.entry);
        if (r.application) onApplication?.(r.application);
        setMessage(`Hi ${first},\n\n`);
        setMoreWorks(false);
        setConfirming(false);
        setJustSent(true);
        setTimeout(() => setJustSent(false), 6000);
      } catch (e) {
        setError((e as Error).message || "The email didn't go out. Try again.");
        setConfirming(false);
      }
    });
  }

  function stop() {
    if (!application) return;
    setError(null);
    startTransition(async () => {
      try {
        await stopMoreWorks(application.id);
        onApplication?.({ ...application, extraWorksLeft: 0 });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className={`rounded-lg bg-paper p-3 ring-1 ring-line ${className}`}>
      <p className="text-xs uppercase tracking-wider text-muted">Email the artist</p>
      {!hasEmail ? (
        <p className="mt-2 text-sm text-muted">There’s no email address on file for this artist.</p>
      ) : (
        <>
          <p className="mt-1 break-all text-xs text-muted">To {artist.email}</p>
          <p className="text-xs text-muted">Replies go to hello@arraegallery.com</p>
          <input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setConfirming(false);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Subject"
            aria-label="Subject"
            className="mt-2 w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line"
          />
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirming(false);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Write your message"
            aria-label="Message"
            className="mt-2 h-36 w-full rounded-md bg-white p-2 text-sm ring-1 ring-line"
          />
          {!accepted && (
            <label className="mt-1 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={moreWorks}
                onChange={(e) => {
                  setMoreWorks(e.target.checked);
                  setConfirming(false);
                }}
                className="mt-0.5"
              />
              <span>
                Let them sign in and add up to {MORE_WORKS} more works for {showName}
                <span className="block text-xs text-muted">Adds an “Add your works” button to the email and moves them to Asked for other works.</span>
              </span>
            </label>
          )}
          {confirming ? (
            <div className="mt-1 rounded-md bg-white p-2 text-sm ring-1 ring-ink/30">
              <p>
                Send this email to {artist.name} now?
                {moreWorks ? ` They'll be able to add up to ${MORE_WORKS} more works.` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={send} disabled={pending} className="rounded-md bg-ink px-3 py-1 text-white disabled:opacity-40">
                  {pending ? "Sending…" : "Yes, send it"}
                </button>
                <button onClick={() => setConfirming(false)} disabled={pending} className="rounded-md px-3 py-1 ring-1 ring-line">
                  Not yet
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-3">
              <button onClick={() => setConfirming(true)} disabled={!ready} className="rounded-md bg-ink px-3 py-1 text-sm text-white disabled:opacity-40">
                Send email
              </button>
              {justSent && <span className="text-sm text-emerald-700">✓ Sent</span>}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
          {left > 0 && (
            <p className="mt-2 rounded-md bg-teal-50 p-2 text-sm text-teal-900 ring-1 ring-teal-200">
              They can still add {left} more work{left === 1 ? "" : "s"} for {showName}.{" "}
              <button onClick={stop} disabled={pending} className="underline">
                Stop this
              </button>
            </p>
          )}
        </>
      )}
      {sent.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <p className="text-[11px] uppercase tracking-wider text-muted">Sent emails</p>
          <ul className="mt-1 space-y-1 text-sm">
            {sent.map((n) => {
              const m = parseDirectEmail(n.body);
              return (
                <li key={n.id}>
                  <details>
                    <summary className="cursor-pointer">
                      <span className="text-[11px] text-muted">
                        {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {n.actor && n.actor !== "You" ? ` · ${n.actor.split("@")[0]}` : ""} ·{" "}
                      </span>
                      {m.subject || "Email"}
                    </summary>
                    <p className="mt-1 whitespace-pre-line rounded bg-white p-2 text-sm ring-1 ring-line">{m.message}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
