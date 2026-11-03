"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Modal, ScheduleCalendar, clock, type CalEvent, type CalShift } from "@/components/ScheduleCalendar";
import { SHIFT_KINDS, shiftTime } from "@/lib/schedule-kinds";
import { acceptSwap, cancelSwap, confirmMonth, requestSwap, saveHours } from "./actions";

type Upcoming = CalShift & { swapId: string | null; canSwap: boolean };
type Offer = CalShift & { swapId: string; swapNote: string | null };

const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
const kind = (s: CalShift) => (s.kind === "standard" ? "Gallery hours" : s.title || SHIFT_KINDS.find((k) => k.id === s.kind)?.label || "Event");
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hours = (list: CalShift[]) => Math.round((list.reduce((n, s) => n + mins(s.endTime) - mins(s.startTime), 0) / 60) * 10) / 10;
const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<string | void>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      try {
        const text = await fn();
        if (text) setMsg({ ok: true, text });
        after?.();
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  return { pending, msg, run };
}
const Note = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? <p className={`mt-3 rounded-md p-2 text-sm ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{msg.text}</p> : null;

export function MySchedule({
  today,
  email,
  name,
  cutoff,
  feed,
  shifts,
  events,
  upcoming,
  offers,
  needHours,
  toConfirm,
  focus,
}: {
  today: string;
  email: string;
  name: string | null;
  cutoff: number;
  feed: string | null;
  shifts: CalShift[];
  events: CalEvent[];
  upcoming: Upcoming[];
  offers: Offer[];
  needHours: CalShift[];
  toConfirm: string[];
  focus: { confirm: string | null; swap: string | null; log: string | null };
}) {
  const [open, setOpen] = useState<CalShift | null>(null);
  const [logging, setLogging] = useState<CalShift | "extra" | null>(null);
  const [swapping, setSwapping] = useState<Upcoming | null>(null);
  const { pending, msg, run } = useRun();
  const mine = shifts.filter((s) => s.assistantEmail === email);

  // Arriving from an email: open the thing it was about.
  useEffect(() => {
    if (focus.log) {
      const sh = shifts.find((s) => s.id === focus.log);
      if (sh) setLogging(sh);
    }
    if (focus.swap) document.getElementById(`offer-${focus.swap}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Gallery Assistants</p>
        <h1 className="font-display text-4xl">{name ? `Hi ${name.split(/\s+/)[0]}` : "Team schedule"}</h1>
        {!name && <p className="mt-1 text-sm text-muted">You&rsquo;re seeing what Gallery Assistants see. You aren&rsquo;t on the schedule yourself, so the buttons are read-only for you.</p>}
      </section>

      <Note msg={msg} />

      {toConfirm.map((m) => {
        const list = mine.filter((s) => s.date.startsWith(m));
        return (
          <section key={m} className={`mb-4 flex flex-wrap items-center gap-4 rounded-lg p-4 ring-1 ${focus.confirm === m ? "bg-amber-50 ring-amber-300" : "bg-white ring-line"}`}>
            <div className="flex-1">
              <h2 className="font-display text-2xl">Your {monthLabel(m)} schedule</h2>
              <p className="text-sm text-muted">
                {list.length} {list.length === 1 ? "shift" : "shifts"}, {hours(list)} hours. Please check them below and confirm you can work them.
              </p>
            </div>
            <button disabled={pending || !name} onClick={() => run(async () => (await confirmMonth(m), `Thanks! Your ${monthLabel(m)} schedule is confirmed.`))} className="rounded-md bg-ink px-5 py-2.5 text-white disabled:opacity-40">
              Confirm {monthLabel(m)}
            </button>
          </section>
        );
      })}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-display text-2xl">My next shifts</h2>
          {upcoming.length ? (
            <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
              {upcoming.slice(0, 12).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{shortDay(s.date)}</span> · {shiftTime(s)}
                    <span className="block text-xs text-muted">
                      {kind(s)}
                      {s.coordinateWith && ` · coordinate with ${s.coordinateWith}`}
                      {s.notes && ` · ${s.notes}`}
                    </span>
                  </div>
                  {s.swapId ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Swap asked</span>
                      <button disabled={pending} onClick={() => run(async () => (await cancelSwap(s.swapId!), "Swap request cancelled. The shift is still yours."))} className="underline">
                        Cancel
                      </button>
                    </span>
                  ) : s.canSwap ? (
                    <button onClick={() => setSwapping(s)} className="rounded-md bg-white px-2.5 py-1 text-xs ring-1 ring-line hover:bg-paper">
                      Ask for a swap
                    </button>
                  ) : (
                    <span className="text-xs text-muted" title={`Swaps close ${cutoff} hours before a shift`}>
                      Too close to swap
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-white p-4 text-sm text-muted ring-1 ring-line">No upcoming shifts.</p>
          )}
          <p className="mt-2 text-xs text-muted">You can ask a teammate to swap until {cutoff} hours before a shift. Everyone gets an email, and the first person to accept takes it.</p>
        </section>

        <div className="space-y-6">
          {needHours.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-2xl">Log your hours</h2>
              <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-rose-200">
                {needHours.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">{shortDay(s.date)}</span> · {s.timeTbd ? kind(s) : `scheduled ${clock(s.startTime)}–${clock(s.endTime)}`}
                    </span>
                    <button onClick={() => setLogging(s)} className="rounded-md bg-ink px-3 py-1 text-xs text-white">
                      Log hours
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-display text-2xl">Teammates need cover</h2>
            {offers.length ? (
              <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
                {offers.map((s) => (
                  <li key={s.id} id={`offer-${s.swapId}`} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm ${focus.swap === s.swapId ? "bg-amber-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{shortDay(s.date)}</span> · {shiftTime(s)} · {s.assistantName}
                      <span className="block text-xs text-muted">
                        {kind(s)}
                        {s.swapNote && ` · “${s.swapNote}”`}
                      </span>
                    </div>
                    <button
                      disabled={pending || !name}
                      onClick={() => confirm(`Take ${s.assistantName}'s shift on ${longDay(s.date)}, ${clock(s.startTime)}–${clock(s.endTime)}?`) && run(async () => (await acceptSwap(s.swapId), "It's yours! The shift is on your schedule now."))}
                      className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-40"
                    >
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-white p-4 text-sm text-muted ring-1 ring-line">Nobody is looking for a swap right now.</p>
            )}
          </section>

          {name && (
            <button onClick={() => setLogging("extra")} className="text-sm text-muted underline">
              Worked hours that weren&rsquo;t on the schedule? Log them here.
            </button>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 font-display text-2xl">Team schedule</h2>
        <ScheduleCalendar today={today} shifts={shifts} events={events} mine={email} onShift={setOpen} />
      </section>

      {feed && <CalendarSync feed={feed} />}

      {open && (
        <Modal title={longDay(open.date)} onClose={() => setOpen(null)}>
          <p className="text-lg">{open.assistantName ?? "Open shift (nobody yet)"}</p>
          <p className="text-sm text-muted">
            {shiftTime(open)} · {kind(open)}
          </p>
          {open.coordinateWith && (
            <p className="mt-2 text-sm">
              Coordinate with <strong>{open.coordinateWith}</strong> to set the hours for the day.
            </p>
          )}
          {open.notes && <p className="mt-3 rounded-md bg-paper p-3 text-sm">{open.notes}</p>}
          {open.swapOpen && <p className="mt-3 text-sm text-amber-900">A swap has been asked for this shift.</p>}
          <div className="mt-5 flex gap-2">
            {(() => {
              const u = upcoming.find((x) => x.id === open.id);
              const o = offers.find((x) => x.id === open.id);
              if (u && !u.swapId && u.canSwap)
                return (
                  <button onClick={() => (setSwapping(u), setOpen(null))} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
                    Ask for a swap
                  </button>
                );
              if (o && name)
                return (
                  <button onClick={() => run(async () => (await acceptSwap(o.swapId), "It's yours! The shift is on your schedule now."), () => setOpen(null))} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
                    Accept this shift
                  </button>
                );
              return null;
            })()}
            <button onClick={() => setOpen(null)} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
              Close
            </button>
          </div>
        </Modal>
      )}
      {swapping && <SwapForm shift={swapping} onClose={() => setSwapping(null)} />}
      {logging && <LogForm shift={logging === "extra" ? null : logging} today={today} onClose={() => setLogging(null)} />}
    </main>
  );
}

function SwapForm({ shift, onClose }: { shift: Upcoming; onClose: () => void }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  const [done, setDone] = useState(false);
  return (
    <Modal title="Ask for a swap" onClose={onClose}>
      <p className="text-sm">
        {longDay(shift.date)}, {clock(shift.startTime)}–{clock(shift.endTime)}
      </p>
      <p className="mt-2 text-sm text-muted">We&rsquo;ll email the rest of the team. The shift stays yours until someone accepts, and we&rsquo;ll email you when they do.</p>
      {!done && (
        <label className="mt-4 block text-xs text-muted">
          A note for the team (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. I have an exam that afternoon" className={input} />
        </label>
      )}
      <Note msg={msg} />
      <div className="mt-5 flex gap-2">
        {!done && (
          <button
            disabled={pending}
            onClick={() => run(async () => { const r = await requestSwap(shift.id, note); setDone(true); return r.emailed ? `Done. We emailed ${r.emailed} ${r.emailed === 1 ? "teammate" : "teammates"}.` : "Done. Your request is on the schedule for the team to see, but the email to them didn't go out."; })}
            className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send to the team"}
          </button>
        )}
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          {done ? "Close" : "Cancel"}
        </button>
      </div>
    </Modal>
  );
}

function LogForm({ shift, today, onClose }: { shift: CalShift | null; today: string; onClose: () => void }) {
  const [v, setV] = useState({ date: shift?.date ?? today, startTime: shift?.startTime ?? "12:30", endTime: shift?.endTime ?? "18:00", note: "" });
  const { pending, msg, run } = useRun();
  const total = Math.max(0, mins(v.endTime) - mins(v.startTime)) / 60;
  return (
    <Modal title={shift ? "Log your hours" : "Log extra hours"} onClose={onClose}>
      {shift ? (
        <p className="text-sm text-muted">
          {longDay(shift.date)}. {shift.timeTbd ? "Enter the hours you actually worked." : `You were scheduled ${clock(shift.startTime)}–${clock(shift.endTime)}. Change the times if you started or finished at a different time.`}
        </p>
      ) : (
        <p className="text-sm text-muted">For time you worked that wasn&rsquo;t a scheduled shift, like helping with an install.</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {!shift && (
          <label className="col-span-2 text-xs text-muted">
            Date
            <input type="date" value={v.date} max={today} onChange={(e) => setV({ ...v, date: e.target.value })} className={input} />
          </label>
        )}
        <label className="text-xs text-muted">
          I started at
          <input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted">
          I finished at
          <input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} className={input} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Note (optional)
          <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder={shift ? "e.g. Stayed late to close up after the opening" : "What you worked on"} className={input} />
        </label>
      </div>
      <p className="mt-3 text-sm">
        Total: <strong>{Math.round(total * 100) / 100} hours</strong>
      </p>
      <Note msg={msg} />
      <div className="mt-5 flex gap-2">
        <button disabled={pending} onClick={() => run(async () => await saveHours({ shiftId: shift?.id ?? null, ...v }), onClose)} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save hours"}
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function CalendarSync({ feed }: { feed: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = feed.replace(/^https?:/, "webcal:");
  return (
    <section className="mt-10 rounded-lg bg-white p-5 ring-1 ring-line">
      <h2 className="font-display text-2xl">Put my shifts in my calendar</h2>
      <p className="mt-1 text-sm text-muted">Your shifts appear in your own calendar app and update by themselves when the schedule changes (Google can take a few hours to catch up).</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={webcal} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
          Add to iPhone / Apple Calendar
        </a>
        <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer" className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Add to Google Calendar
        </a>
        <button
          onClick={() => navigator.clipboard.writeText(feed).then(() => setCopied(true))}
          className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line"
        >
          {copied ? "Copied!" : "Copy calendar link"}
        </button>
        <a href={feed} className="rounded-md px-4 py-2 text-sm text-muted underline">
          Download .ics file
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">Outlook or another app: copy the link, then choose &ldquo;Add calendar&rdquo; → &ldquo;From internet / subscribe&rdquo; and paste it. Keep this link private: anyone with it can see your shifts.</p>
    </section>
  );
}
