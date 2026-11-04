"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTeamMember, changeTeamEmail, sendWelcome, setTeamAccess } from "./actions";

type Member = { email: string; name: string | null; addedBy: string | null; since: string; revoked: boolean; lastSeen: string | null };
const seenFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";

const CAN = ["Artists: roster profiles to view (no editing), notes, asking for better photos", "Inbox: read and answer artist messages", "Logistics: drop-off and pick-up times, marking works received", "Schedule: their shifts and the team's, swaps, hours and calendar sync"];
const CANNOT = ["Review boards and decisions", "Sandbox", "Waitlist", "Email artists (mass email)", "Editing artist details, works, photos or onboarding", "Shows, Shopify and Team settings"];

export function TeamManager({ owners, members, configured }: { owners: string[]; members: Member[]; configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [preferred, setPreferred] = useState("");
  const [welcome, setWelcome] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState("");
  const [fixResend, setFixResend] = useState(true);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | void>) =>
    start(async () => {
      setMsg(null);
      try {
        const text = await fn();
        if (text) setMsg({ ok: true, text });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  const active = members.filter((m) => !m.revoked);
  const revoked = members.filter((m) => m.revoked);
  return (
    <main className="mx-auto max-w-4xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Team</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Your team: interns and Gallery Assistants. Everyone you add here gets portal access and is on the Team schedule. Removing someone works immediately, even if they are signed in, and their upcoming shifts become open shifts.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-4 text-sm ring-1 ring-line">
          <h2 className="text-xs uppercase tracking-wider text-muted">Team members can</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">{CAN.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div className="rounded-lg bg-white p-4 text-sm ring-1 ring-line">
          <h2 className="text-xs uppercase tracking-wider text-muted">Only owners can</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </section>

      <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-line">
        <h2 className="text-xs uppercase tracking-wider text-muted">Add a team member</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-xs text-muted">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="intern@arraegallery.com" className={input} />
          </label>
          <label className="min-w-40 flex-1 text-xs text-muted">
            Full name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Samantha Ruiz" className={input} />
          </label>
          <label className="min-w-32 flex-1 text-xs text-muted">
            Preferred name (optional)
            <input value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="Sam" className={input} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={welcome && configured} disabled={!configured} onChange={(e) => setWelcome(e.target.checked)} />
            Email them a welcome note
          </label>
          <button
            disabled={pending || !email.trim()}
            onClick={() =>
              run(async () => {
                const r = await addTeamMember({ email, name, preferredName: preferred, welcome: welcome && configured });
                setEmail("");
                setName("");
                setPreferred("");
                return r.emailed ? "Added, and a welcome email is on its way." : "Added. They can sign in at arrae-portal.vercel.app with that email.";
              })
            }
            className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {!configured && <p className="mt-2 text-xs text-muted">Welcome emails start working once RESEND_API_KEY is set in Vercel.</p>}
        {msg && <p className={`mt-3 rounded-md p-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      </section>

      <section className="mt-6">
        <h2 className="text-xs uppercase tracking-wider text-muted">People with access</h2>
        <ul className="mt-2 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {owners.map((o) => (
            <li key={o} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium">{o}</span>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">Owner</span>
              <span className="ml-auto text-xs text-muted">Set in Vercel (ADMIN_EMAILS)</span>
            </li>
          ))}
          {active.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{m.name ?? m.email}</span>
              {m.name && <span className="text-muted">{m.email}</span>}
              <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] ring-1 ring-line">Team</span>
              <span className={`text-xs ${m.lastSeen ? "text-emerald-800" : "text-amber-800"}`} suppressHydrationWarning>
                {m.lastSeen ? `Last signed in ${seenFmt.format(new Date(m.lastSeen))}` : "Hasn't signed in yet"}
              </span>
              {configured && (
                <button
                  disabled={pending}
                  onClick={() => run(async () => ((await sendWelcome(m.email)) ? `Welcome email sent to ${m.name ?? m.email}.` : "The email didn't go out. Try again in a minute."))}
                  className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line hover:bg-paper"
                >
                  {m.lastSeen ? "Resend sign-in email" : "Send welcome email"}
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => {
                  setFixing(fixing === m.email ? null : m.email);
                  setFixed(m.email);
                }}
                className={`${configured ? "" : "ml-auto "}rounded-md px-3 py-1 text-xs ring-1 ring-line hover:bg-paper`}
              >
                Edit email
              </button>
              <button
                disabled={pending}
                onClick={() => confirm(`Remove ${m.name ?? m.email}'s access? They'll be signed out of the portal right away.`) && run(() => setTeamAccess(m.email, false))}
                className="rounded-md px-3 py-1 text-xs text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
              >
                Remove access
              </button>
              {fixing === m.email && (
                <form
                  className="flex w-full flex-wrap items-center gap-2 rounded-md bg-paper p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const r = await changeTeamEmail(m.email, fixed, configured && fixResend);
                      if (!r.ok) throw new Error(r.error);
                      setFixing(null);
                      const to = fixed.trim().toLowerCase();
                      return r.value.emailed ? `Email changed to ${to} and the invite was sent there.` : `Email changed to ${to}.`;
                    });
                  }}
                >
                  <label className="text-xs text-muted" htmlFor={`fix-${m.email}`}>
                    Correct email
                  </label>
                  <input
                    id={`fix-${m.email}`}
                    type="email"
                    required
                    autoFocus
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value)}
                    className="min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-line"
                  />
                  {configured && (
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={fixResend} onChange={(e) => setFixResend(e.target.checked)} />
                      Send the invite to the new email
                    </label>
                  )}
                  <button disabled={pending} className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-50">
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setFixing(null)} className="text-xs text-muted underline">
                    Cancel
                  </button>
                  <p className="w-full text-xs text-muted">Their shifts, hours and schedule move to the new email. The old email stops working.</p>
                </form>
              )}
            </li>
          ))}
          {!active.length && <li className="p-3 text-sm text-muted">No team members yet.</li>}
        </ul>
        {revoked.length > 0 && (
          <>
            <h2 className="mt-6 text-xs uppercase tracking-wider text-muted">Removed</h2>
            <ul className="mt-2 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
              {revoked.map((m) => (
                <li key={m.email} className="flex items-center gap-3 p-3 text-sm text-muted">
                  <span>{m.name ?? m.email}</span>
                  {m.name && <span>{m.email}</span>}
                  <button disabled={pending} onClick={() => run(() => setTeamAccess(m.email, true))} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line hover:bg-paper">
                    Give access again
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
