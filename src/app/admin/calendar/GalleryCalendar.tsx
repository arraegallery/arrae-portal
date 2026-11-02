"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateShow } from "../actions";
import { deleteEvent, saveEvent, type EventInput } from "./actions";
import { DEADLINE_CHIP, DEADLINE_DOT, EVENT_KINDS, SHOW_CHIP, SHOW_DOT, WINDOW_CHIP, WINDOW_DOT } from "./kinds";

type Show = { id: string; name: string; type: string; opensOn: string | null; closesOn: string | null; applicationDeadline: string | null; decisionsDueOn: string | null };
type Window = { id: number; kind: string; startsOn: string; endsOn: string; show: string };
type Event = {
  id: string;
  title: string;
  kind: string;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  showId: string | null;
};
type Item = { key: string; label: string; start: string; end: string; chip: string; dot: string; detail?: string; open: () => void };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 86400000));
const monthLabel = (m: string) => toDate(`${m}-01`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const shortDay = (d: string) => toDate(d).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const shiftMonth = (m: string, n: number) => {
  const d = toDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};
const clock = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const timeRange = (e: Event) => (e.startTime ? `${clock(e.startTime)}${e.endTime ? `–${clock(e.endTime)}` : ""}` : "");
const dayRange = (start: string, end: string) => (start === end ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`);

const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";
const blank = (day: string): EventInput => ({ title: "", kind: "event", startsOn: day, endsOn: "", startTime: "", endTime: "", location: "", notes: "", showId: "" });

export function GalleryCalendar({ today, owner, feedUrl, shows, windows, events }: { today: string; owner: boolean; feedUrl: string | null; shows: Show[]; windows: Window[]; events: Event[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<EventInput | null>(null);
  const [dating, setDating] = useState<Show | null>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const sh of shows) {
      // Show dates are owner-only; for staff a show just links to nothing.
      const open = () => owner && setDating(sh);
      if (sh.opensOn || sh.closesOn) {
        const start = sh.opensOn ?? sh.closesOn!;
        const end = sh.closesOn && sh.closesOn >= start ? sh.closesOn : start;
        out.push({ key: `show-${sh.id}`, label: sh.name, start, end, chip: SHOW_CHIP, dot: SHOW_DOT, detail: `${sh.type} · on view`, open });
      }
      if (sh.applicationDeadline)
        out.push({ key: `dl-${sh.id}`, label: `Applications close: ${sh.name}`, start: sh.applicationDeadline, end: sh.applicationDeadline, chip: DEADLINE_CHIP, dot: DEADLINE_DOT, open });
      if (sh.decisionsDueOn)
        out.push({ key: `dd-${sh.id}`, label: `Decisions due: ${sh.name}`, start: sh.decisionsDueOn, end: sh.decisionsDueOn, chip: DEADLINE_CHIP, dot: DEADLINE_DOT, open });
    }
    for (const w of windows)
      out.push({
        key: `win-${w.id}`,
        label: `${w.kind === "pickup" ? "Pick-up" : "Drop-off"}: ${w.show}`,
        start: w.startsOn,
        end: w.endsOn >= w.startsOn ? w.endsOn : w.startsOn,
        chip: WINDOW_CHIP,
        dot: WINDOW_DOT,
        detail: "Artist booking window",
        open: () => router.push("/admin/logistics"),
      });
    for (const e of events) {
      const k = EVENT_KINDS.find((x) => x.id === e.kind) ?? EVENT_KINDS[0];
      out.push({
        key: e.id,
        label: e.title,
        start: e.startsOn,
        end: e.endsOn && e.endsOn > e.startsOn ? e.endsOn : e.startsOn,
        chip: k.chip,
        dot: k.dot,
        detail: [k.label, timeRange(e), e.location].filter(Boolean).join(" · "),
        open: () =>
          setEditing({
            id: e.id,
            title: e.title,
            kind: e.kind,
            startsOn: e.startsOn,
            endsOn: e.endsOn ?? "",
            startTime: e.startTime ?? "",
            endTime: e.endTime ?? "",
            location: e.location ?? "",
            notes: e.notes ?? "",
            showId: e.showId ?? "",
          }),
      });
    }
    // Shows first (they're long), then by start date.
    return out.sort((a, b) => a.start.localeCompare(b.start) || (b.end > a.end ? 1 : -1));
  }, [shows, windows, events, router, owner]);

  const first = `${month}-01`;
  const gridStart = addDays(first, -toDate(first).getUTCDay());
  const monthEnd = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = addDays(monthEnd, 6 - toDate(monthEnd).getUTCDay());
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const on = (d: string) => items.filter((i) => i.start <= d && i.end >= d);
  const agenda = items.filter((i) => i.start <= monthEnd && i.end >= first);
  const undated = shows.filter((sh) => !sh.opensOn && !sh.closesOn);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">Gallery calendar</h1>
          <p className="mt-1 text-sm text-muted">Shows, deadlines, drop-off and pick-up windows, and your own events. Click a day to add an event.</p>
        </div>
        <button onClick={() => setEditing(blank(today))} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
          Add event
        </button>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" aria-label="Previous month">
          ←
        </button>
        <button onClick={() => setMonth(today.slice(0, 7))} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line">
          Today
        </button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" aria-label="Next month">
          →
        </button>
        <h2 className="ml-2 font-display text-2xl">{monthLabel(month)}</h2>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted">
          <Legend dot={SHOW_DOT} label="Show on view" />
          <Legend dot={DEADLINE_DOT} label="Deadline" />
          <Legend dot={WINDOW_DOT} label="Drop-off / pick-up" />
          {EVENT_KINDS.map((k) => (
            <Legend key={k.id} dot={k.dot} label={k.label} />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-line">
        <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs uppercase tracking-wider text-muted">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = on(d);
            const inMonth = d.slice(0, 7) === month;
            return (
              <div
                key={d}
                onClick={() => setEditing(blank(d))}
                className={`min-h-16 cursor-pointer border-b border-r border-line p-1 hover:bg-paper sm:min-h-28 ${inMonth ? "" : "bg-paper/60 text-muted"}`}
              >
                <div className={`mb-1 text-xs ${d === today ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white" : ""}`}>{Number(d.slice(8))}</div>
                <div className="hidden space-y-0.5 sm:block">
                  {list.map((i) => (
                    <button
                      key={i.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        i.open();
                      }}
                      title={[i.label, i.detail, dayRange(i.start, i.end)].filter(Boolean).join("\n")}
                      className={`block w-full truncate px-1.5 py-0.5 text-left text-[11px] ring-1 ${i.chip} ${i.start === d || d === gridStart || toDate(d).getUTCDay() === 0 ? "rounded-l" : "-ml-1 pl-2.5"} ${i.end === d || toDate(d).getUTCDay() === 6 ? "rounded-r" : "-mr-1"}`}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.map((i) => (
                    <span key={i.key} className={`h-1.5 w-1.5 rounded-full ${i.dot}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <h3 className="mb-2 font-display text-xl">This month</h3>
          {agenda.length ? (
            <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
              {agenda.map((i) => (
                <li key={i.key}>
                  <button onClick={i.open} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-paper">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{i.label}</span>
                      {i.detail && <span className="block truncate text-xs text-muted">{i.detail}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{dayRange(i.start, i.end)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-white p-4 text-sm text-muted ring-1 ring-line">Nothing on the calendar this month yet.</p>
          )}
        </div>
        {owner && undated.length > 0 && (
          <div className="min-w-0">
            <h3 className="mb-2 font-display text-xl">Shows without dates</h3>
            <p className="mb-2 text-xs text-muted">Give a show its run dates to see it on the calendar.</p>
            <ul className="space-y-1">
              {undated.map((sh) => (
                <li key={sh.id}>
                  <button onClick={() => setDating(sh)} className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-left text-sm ring-1 ring-line hover:bg-paper">
                    <span className="truncate">{sh.name}</span>
                    <span className="shrink-0 text-xs text-muted underline">Set dates</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">
        {feedUrl ? (
          <>
            Google Calendar: everything here, plus each drop-off and pick-up booking, is in your private calendar link. Copy it into Google Calendar under Other calendars, then From URL:{" "}
            <span className="break-all font-mono text-xs text-ink">{feedUrl}</span>
          </>
        ) : owner ? (
          <>
            Want this in Google Calendar? Turn on the private calendar link on the{" "}
            <Link href="/admin/logistics" className="underline">
              Logistics
            </Link>{" "}
            page.
          </>
        ) : null}
      </p>

      {editing && <EventForm value={editing} shows={shows} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), router.refresh())} />}
      {dating && <ShowDates show={dating} onClose={() => setDating(null)} onSaved={() => (setDating(null), router.refresh())} />}
    </main>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} className="text-xl text-muted" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EventForm({ value, shows, onClose, onSaved }: { value: EventInput; shows: Show[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof EventInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        onSaved();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <Modal title={v.id ? "Edit event" : "Add event"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-muted">
          Name
          <input autoFocus value={v.title} onChange={set("title")} placeholder="Volume IV opening reception" className={input} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Type
          <select value={v.kind} onChange={set("kind")} className={input}>
            {EVENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Date
          <input type="date" value={v.startsOn} onChange={set("startsOn")} className={input} />
        </label>
        <label className="text-xs text-muted">
          Ends on (if more than one day)
          <input type="date" value={v.endsOn} min={v.startsOn} onChange={set("endsOn")} className={input} />
        </label>
        <label className="text-xs text-muted">
          Start time
          <input type="time" value={v.startTime} onChange={set("startTime")} className={input} />
        </label>
        <label className="text-xs text-muted">
          End time
          <input type="time" value={v.endTime} onChange={set("endTime")} className={input} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Where
          <input value={v.location} onChange={set("location")} placeholder="ARRAE Gallery" className={input} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Related show (optional)
          <select value={v.showId} onChange={set("showId")} className={input}>
            <option value="">None</option>
            {shows.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 text-xs text-muted">
          Notes
          <textarea value={v.notes} onChange={set("notes")} rows={3} className={input} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => run(() => saveEvent(v))} disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Cancel
        </button>
        {v.id && (
          <button
            onClick={() => confirm(`Delete "${v.title}"?`) && run(() => deleteEvent(v.id!))}
            disabled={pending}
            className="ml-auto rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
          >
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}

function ShowDates({ show, onClose, onSaved }: { show: Show; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    opensOn: show.opensOn ?? "",
    closesOn: show.closesOn ?? "",
    applicationDeadline: show.applicationDeadline ?? "",
    decisionsDueOn: show.decisionsDueOn ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof v, label: string) => (
    <label className="text-xs text-muted">
      {label}
      <input type="date" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={input} />
    </label>
  );
  const save = () =>
    start(async () => {
      setError(null);
      if (v.opensOn && v.closesOn && v.closesOn < v.opensOn) return setError("The closing date is before the opening date");
      try {
        await updateShow(show.id, v);
        onSaved();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <Modal title={show.name} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">{show.type}. These are the same dates as on the Shows page.</p>
      <div className="grid grid-cols-2 gap-3">
        {field("opensOn", "Opens")}
        {field("closesOn", "Closes")}
        {field("applicationDeadline", "Applications close")}
        {field("decisionsDueOn", "Decisions due")}
      </div>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <button onClick={save} disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save dates"}
        </button>
        <button onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm ring-1 ring-line">
          Cancel
        </button>
        <Link href="/admin/shows" className="ml-auto text-sm text-muted underline">
          Shows page
        </Link>
      </div>
    </Modal>
  );
}
