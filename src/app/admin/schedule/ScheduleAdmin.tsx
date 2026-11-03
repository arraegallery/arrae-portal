"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal, ScheduleCalendar, addDays, clock, type CalEvent, type CalShift } from "@/components/ScheduleCalendar";
import { PERSON_COLORS, SHIFT_KINDS, personColor } from "@/lib/schedule-kinds";
import {
  clearOpenShifts,
  deleteShift,
  fillStandardHours,
  saveShift,
  sendMonthNow,
  setSwapCutoff,
  updateAssistant,
  type ShiftInput,
} from "./actions";

type Person = { email: string; name: string; preferredName: string | null; phone: string | null; color: string; feed: string };
type Confirmation = { email: string; month: string; sent: boolean; confirmed: boolean };
type Swap = { id: string; status: string; from: string; takenBy: string | null; note: string | null; date: string; startTime: string; endTime: string };

const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";
const STANDARD: Record<number, [string, string]> = { 3: ["12:30", "18:00"], 4: ["12:30", "18:00"], 5: ["12:30", "18:00"], 6: ["10:30", "18:00"] };
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const lastOfMonth = (d: string) => {
  const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1);
  return addDays(x.toISOString().slice(0, 10), -1);
};

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
  return { pending, msg, setMsg, run };
}

const Note = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? <p className={`mt-3 rounded-md p-2 text-sm ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{msg.text}</p> : null;

export function ScheduleAdmin({
  today,
  months,
  emailOn,
  cutoff,
  people,
  shifts,
  events,
  confirmations,
  swaps,
}: {
  today: string;
  months: string[];
  emailOn: boolean;
  cutoff: number;
  people: Person[];
  shifts: CalShift[];
  events: CalEvent[];
  confirmations: Confirmation[];
  swaps: Swap[];
}) {
  const [editing, setEditing] = useState<ShiftInput | null>(null);
  const [filling, setFilling] = useState(false);
  const nameOf = (email: string | null) => people.find((p) => p.email === email)?.name ?? email ?? "";
  const blank = (date: string, start?: string): ShiftInput => {
    const std = STANDARD[dow(date)];
    const startTime = start ?? std?.[0] ?? "12:00";
    const endTime = start ? `${String(Math.min(Number(start.slice(0, 2)) + 4, 23)).padStart(2, "0")}:00` : std?.[1] ?? "18:00";
    const kind = start || !std ? "special" : "standard";
    return { date, startTime, endTime, kind, title: "", notes: "", assistantEmail: "", repeatWeeks: 0, timeTbd: false, maxHours: null, coordinateWith: "", onCalendar: kind !== "standard" };
  };
  const upcoming = shifts.filter((s) => s.date >= today);
  const openCount = upcoming.filter((s) => !s.assistantEmail).length;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Gallery management</p>
          <h1 className="font-display text-4xl">Team schedule</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Assign Gallery Assistant shifts. Click a day to add a shift, or click a shift to change who has it. {openCount > 0 && <strong className="text-ink">{openCount} upcoming {openCount === 1 ? "shift has" : "shifts have"} nobody yet.</strong>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/schedule/hours" className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
            Hours report
          </Link>
          <button onClick={() => setFilling(true)} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
            Fill gallery hours
          </button>
          <button onClick={() => setEditing(blank(today))} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
            Add shift
          </button>
        </div>
      </section>

      {people.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Start by adding your team on the{" "}
          <Link href="/admin/team" className="underline">
            Team page
          </Link>
          . Everyone there is on the schedule. Then fill in gallery hours and assign each shift.
        </p>
      )}

      <ScheduleCalendar
        today={today}
        shifts={shifts}
        events={events}
        addHint="Add a shift on this day"
        onAdd={(d, start) => setEditing(blank(d, start))}
        onShift={(s) =>
          setEditing({
            id: s.id,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            kind: s.kind,
            title: s.title ?? "",
            notes: s.notes ?? "",
            assistantEmail: s.assistantEmail ?? "",
            timeTbd: s.timeTbd,
            maxHours: s.maxHours,
            coordinateWith: s.coordinateWith ?? "",
            onCalendar: s.onCalendar,
          })
        }
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Roster people={people} months={months} confirmations={confirmations} />
        <div className="space-y-8">
          <MonthlyEmail months={months} emailOn={emailOn} />
          <Swaps swaps={swaps} nameOf={nameOf} cutoff={cutoff} />
        </div>
      </div>

      {editing && <ShiftForm value={editing} people={people} onClose={() => setEditing(null)} />}
      {filling && <FillForm today={today} people={people} onClose={() => setFilling(false)} />}
    </main>
  );
}

function ShiftForm({ value, people, onClose }: { value: ShiftInput; people: Person[]; onClose: () => void }) {
  const [v, setV] = useState(value);
  const [copied, setCopied] = useState(false);
  /** Turns this form into a new copy of the shift on the next day. Nothing is saved until Save. */
  const duplicate = () => {
    setV({ ...v, id: undefined, date: addDays(v.date, 1), repeatWeeks: 0 });
    setCopied(true);
  };
  const { pending, msg, run } = useRun();
  const set = (k: keyof ShiftInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const std = STANDARD[dow(v.date)];
  return (
    <Modal title={v.id ? "Edit shift" : copied ? "Copy of shift" : "Add a shift"} onClose={onClose}>
      {copied && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">This is a copy. Pick its date (and person), then click Save shift. The original stays as it was.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-muted">
          Gallery Assistant
          <select value={v.assistantEmail} onChange={set("assistantEmail")} className={input} autoFocus>
            <option value="">Nobody yet (open shift)</option>
            {people.map((p) => (
              <option key={p.email} value={p.email}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Date
          <input type="date" value={v.date} onChange={set("date")} className={input} />
        </label>
        <label className="text-xs text-muted">
          Type
          <select
            value={v.kind}
            onChange={(e) => {
              const kind = e.target.value;
              const tbd = kind === "setup" || kind === "breakdown";
              setV({ ...v, kind, onCalendar: kind !== "standard", ...(tbd && !v.id ? { timeTbd: true, maxHours: v.maxHours ?? 6 } : {}), ...(kind === "standard" ? { timeTbd: false } : {}) });
            }}
            className={input}
          >
            {SHIFT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {v.kind !== "standard" && (
          <>
            <label className="col-span-2 text-xs text-muted">
              Event name
              <input value={v.title} onChange={set("title")} placeholder={v.kind === "breakdown" ? "Biscayne Collective break down" : "Volume IV set up"} className={input} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v.timeTbd} onChange={(e) => setV({ ...v, timeTbd: e.target.checked, maxHours: v.maxHours ?? 6 })} />
              Hours TBD: they&rsquo;ll work out the times with someone
            </label>
          </>
        )}
        {v.timeTbd && v.kind !== "standard" ? (
          <label className="text-xs text-muted">
            Not more than (hours)
            <input type="number" min={1} max={16} step={0.5} value={v.maxHours ?? ""} onChange={(e) => setV({ ...v, maxHours: e.target.value ? Number(e.target.value) : null })} className={input} />
          </label>
        ) : (
          <>
            <label className="text-xs text-muted">
              Starts
              <input type="time" value={v.startTime} onChange={set("startTime")} className={input} />
            </label>
            <label className="text-xs text-muted">
              Ends
              <input type="time" value={v.endTime} onChange={set("endTime")} className={input} />
            </label>
            {std && (v.startTime !== std[0] || v.endTime !== std[1]) && (
              <p className="col-span-2 -mt-1 text-xs text-muted">
                Gallery hours that day are {clock(std[0])}–{clock(std[1])}.{" "}
                <button onClick={() => setV({ ...v, startTime: std[0], endTime: std[1] })} className="underline">
                  Use them
                </button>
              </p>
            )}
          </>
        )}
        {v.kind !== "standard" && (
          <>
            <label className={`${v.timeTbd ? "" : "col-span-2"} text-xs text-muted`}>
              Coordinate with (to finalize the day and hours)
              <input value={v.coordinateWith ?? ""} onChange={set("coordinateWith")} placeholder="e.g. Lauren, or the artists" className={input} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v.onCalendar} onChange={(e) => setV({ ...v, onCalendar: e.target.checked })} />
              Show it on the gallery calendar too
            </label>
          </>
        )}
        <label className="col-span-2 text-xs text-muted">
          Notes for the assistant (optional)
          <textarea value={v.notes} onChange={set("notes")} rows={2} placeholder="e.g. Bring the guest book, set up the bar at 5:30" className={input} />
        </label>
        {!v.id && (
          <label className="col-span-2 text-xs text-muted">
            Repeat every week
            <select value={v.repeatWeeks ?? 0} onChange={(e) => setV({ ...v, repeatWeeks: Number(e.target.value) })} className={input}>
              <option value={0}>No, just this day</option>
              {[3, 7, 11, 15].map((n) => (
                <option key={n} value={n}>
                  Yes, for {n + 1} weeks (until {shortDay(addDays(v.date, n * 7))})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Note msg={msg} />
      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => run(() => saveShift(v), onClose)} disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save shift"}
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Cancel
        </button>
        {v.id && (
          <button onClick={duplicate} disabled={pending} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
            Duplicate
          </button>
        )}
        {v.id && (
          <button onClick={() => confirm("Delete this shift?") && run(() => deleteShift(v.id!), onClose)} disabled={pending} className="ml-auto rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}

function FillForm({ today, people, onClose }: { today: string; people: Person[]; onClose: () => void }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(lastOfMonth(addDays(lastOfMonth(today), 1)));
  const [who, setWho] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <Modal title="Fill in gallery hours" onClose={onClose}>
      <p className="text-sm text-muted">
        Adds a shift for every open day: Wednesday to Friday 12:30–6pm and Saturday 10:30am–6pm. Days that already have a gallery-hours shift, and days marked &ldquo;Gallery closed&rdquo; on the
        calendar, are skipped. Then click each shift to assign it.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Give them all to
          <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
            <option value="">Nobody yet (I&rsquo;ll assign them one by one)</option>
            {people.map((p) => (
              <option key={p.email} value={p.email}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Note msg={msg} />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(async () => `Added ${(await fillStandardHours(from, to, who)).added} shifts.`)}
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {pending ? "Working…" : "Add the shifts"}
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Done
        </button>
        <button
          onClick={() => confirm("Remove every shift with nobody assigned between these dates?") && run(async () => `Removed ${(await clearOpenShifts(from, to)).removed} open shifts.`)}
          disabled={pending}
          className="ml-auto rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
        >
          Remove open shifts in these dates
        </button>
      </div>
    </Modal>
  );
}

function Roster({ people, months, confirmations }: { people: Person[]; months: string[]; confirmations: Confirmation[] }) {
  const [edit, setEdit] = useState<Person | null>(null);
  const status = (p: Person, m: string) => {
    const c = confirmations.find((x) => x.email === p.email && x.month === m);
    if (c?.confirmed) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">Confirmed</span>;
    if (c?.sent) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Waiting</span>;
    return <span className="text-muted">Not sent</span>;
  };
  return (
    <section id="assistants">
      <h2 className="mb-2 font-display text-2xl">Gallery Assistants</h2>
      <p className="mb-3 text-sm text-muted">Your team. Each person sees their shifts and the team&rsquo;s under My shifts, and confirms each month here.</p>
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2">
                  {monthLabel(m)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((p) => (
              <tr key={p.email}>
                <td className="px-3 py-2">
                  <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${personColor(p.color).dot}`} />
                  {p.name}
                  {p.preferredName && <span className="text-muted"> ({p.preferredName})</span>}
                  <span className="block pl-[18px] text-xs text-muted">{p.email}</span>
                </td>
                {months.map((m) => (
                  <td key={m} className="px-3 py-2 text-xs">
                    {status(p, m)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setEdit(p)} className="text-xs underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!people.length && (
              <tr>
                <td colSpan={months.length + 2} className="px-3 py-4 text-muted">
                  Nobody yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">
        <Link href="/admin/team" className="underline">
          Add or remove people on the Team page
        </Link>
        <span className="text-muted">. Everyone on the team is on the schedule.</span>
      </p>
      {edit && <PersonForm person={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function PersonForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const [v, setV] = useState({ name: person.name, preferredName: person.preferredName ?? "", phone: person.phone ?? "", color: person.color });
  const { pending, msg, run } = useRun();
  return (
    <Modal title={person.name} onClose={onClose}>
      <div className="grid gap-3">
        <label className="text-xs text-muted">
          Full name (used on the hours report)
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted">
          Preferred name (what the team calls them, shown on the schedule and in emails)
          <input value={v.preferredName} onChange={(e) => setV({ ...v, preferredName: e.target.value })} placeholder={person.name.split(/\s+/)[0]} className={input} />
        </label>
        <label className="text-xs text-muted">
          Phone
          <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={input} />
        </label>
        <div className="text-xs text-muted">
          Color on the calendar
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(PERSON_COLORS).map(([k, c]) => (
              <button key={k} onClick={() => setV({ ...v, color: k })} title={c.label} className={`h-7 w-7 rounded-full ${c.dot} ${v.color === k ? "ring-2 ring-ink ring-offset-2" : ""}`} />
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          Their private calendar link: <span className="break-all font-mono text-ink">{person.feed}</span>
        </p>
      </div>
      <Note msg={msg} />
      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => run(() => updateAssistant(person.email, v), onClose)} disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          Save
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Cancel
        </button>
        <Link href="/admin/team" className="ml-auto text-sm text-muted underline">
          Remove on the Team page
        </Link>
      </div>
    </Modal>
  );
}

function MonthlyEmail({ months, emailOn }: { months: string[]; emailOn: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <section>
      <h2 className="mb-2 font-display text-2xl">Monthly schedule email</h2>
      <p className="text-sm text-muted">
        On the 1st of every month, each assistant gets their shifts for the month with a <em>Confirm</em> button. Every Sunday they get the week ahead, and after each shift a reminder to log their hours.
        You can also send a month now, for example once next month is ready.
      </p>
      {!emailOn && <p className="mt-2 text-sm text-rose-700">Email isn&rsquo;t set up (RESEND_API_KEY is missing), so nothing will send.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {months.map((m) => (
          <button
            key={m}
            disabled={pending}
            onClick={() => run(async () => { const r = await sendMonthNow(m, false); return `Sent ${r.sent}. ${r.skipped} skipped (already sent, or no shifts that month).`; })}
            className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line disabled:opacity-40"
          >
            Send {monthLabel(m)} schedule
          </button>
        ))}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Changed the schedule after sending?</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {months.map((m) => (
            <button
              key={m}
              disabled={pending}
              onClick={() => confirm(`Email everyone their ${monthLabel(m)} schedule again and ask them to confirm again?`) && run(async () => `Sent ${(await sendMonthNow(m, true)).sent}.`)}
              className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line disabled:opacity-40"
            >
              Ask everyone to re-confirm {monthLabel(m)}
            </button>
          ))}
        </div>
      </details>
      <Note msg={msg} />
    </section>
  );
}

function Swaps({ swaps, nameOf, cutoff }: { swaps: Swap[]; nameOf: (e: string | null) => string; cutoff: number }) {
  const [hours, setHours] = useState(cutoff);
  const { pending, msg, run } = useRun();
  const label: Record<string, string> = { open: "Looking for cover", taken: "Swapped", cancelled: "Cancelled", expired: "Nobody took it" };
  return (
    <section>
      <h2 className="mb-2 font-display text-2xl">Swaps</h2>
      {swaps.length ? (
        <ul className="divide-y divide-line rounded-lg bg-white text-sm ring-1 ring-line">
          {swaps.map((s) => (
            <li key={s.id} className="px-3 py-2">
              <span className="font-medium">{shortDay(s.date)}</span> {clock(s.startTime)}–{clock(s.endTime)} · {nameOf(s.from)}
              {s.takenBy && <> → {nameOf(s.takenBy)}</>}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${s.status === "open" ? "bg-amber-100 text-amber-900" : s.status === "taken" ? "bg-emerald-100 text-emerald-900" : "bg-stone-100 text-stone-700"}`}>
                {label[s.status] ?? s.status}
              </span>
              {s.note && <span className="block text-xs text-muted">&ldquo;{s.note}&rdquo;</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-white p-3 text-sm text-muted ring-1 ring-line">No swap requests yet.</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs text-muted">
          Swaps can be asked for until
          <span className="mt-0.5 flex items-center gap-2 text-sm text-ink">
            <input type="number" min={0} max={336} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-20 rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
            hours before the shift
          </span>
        </label>
        {hours !== cutoff && (
          <button onClick={() => run(async () => { await setSwapCutoff(hours); return "Saved."; })} disabled={pending} className="rounded-md bg-ink px-3 py-1.5 text-white">
            Save
          </button>
        )}
      </div>
      <Note msg={msg} />
    </section>
  );
}
