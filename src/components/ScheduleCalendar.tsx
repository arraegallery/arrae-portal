"use client";

import { useEffect, useState } from "react";
import { EVENT_CHIP, OPEN_CHIP, SHIFT_KINDS, personColor, shiftTime } from "@/lib/schedule-kinds";

export type CalShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: string;
  title: string | null;
  notes: string | null;
  assistantEmail: string | null;
  assistantName: string | null;
  color: string | null;
  swapOpen: boolean;
  timeTbd: boolean;
  maxHours: number | null;
  coordinateWith: string | null;
  onCalendar: boolean;
};
export type CalEvent = { id: string; title: string; start: string; end: string; startTime: string | null; endTime: string | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_PX = 44;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 86400000));
const shiftMonth = (m: string, n: number) => {
  const d = toDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};
const monthLabel = (m: string) => toDate(`${m}-01`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const dayHead = (d: string) => toDate(d).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const firstName = (n: string | null) => (n ? n.split(/\s+/)[0] : "Open");
export const weekStart = (d: string) => addDays(d, -toDate(d).getUTCDay());

export function shiftChip(sh: CalShift) {
  return sh.assistantEmail ? personColor(sh.color).chip : OPEN_CHIP;
}

/**
 * The schedule as a month grid or a week of hour columns. Shifts are colored by person;
 * dashed ones are open (nobody assigned yet). Gallery events show in grey for context.
 */
export function ScheduleCalendar({
  today,
  shifts,
  events,
  mine,
  onShift,
  onAdd,
  addHint,
}: {
  today: string;
  shifts: CalShift[];
  events: CalEvent[];
  /** The viewer's email: their shifts get a ring and others fade when "Just me" is on. */
  mine?: string;
  onShift: (s: CalShift) => void;
  onAdd?: (date: string, start?: string) => void;
  addHint?: string;
}) {
  const [view, setView] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [week, setWeek] = useState(weekStart(today));
  const [justMe, setJustMe] = useState(false);
  // Keep the month or week being looked at when the page reloads its data after a save.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`cal:${location.pathname}`) ?? "null");
      if (saved?.month) setMonth(saved.month);
      if (saved?.week) setWeek(saved.week);
      if (saved?.view === "week" || saved?.view === "month") setView(saved.view);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(`cal:${location.pathname}`, JSON.stringify({ view, month, week }));
    } catch {}
  }, [view, month, week]);
  const shown = justMe && mine ? shifts.filter((s) => s.assistantEmail === mine) : shifts;
  const onDay = (d: string) => shown.filter((s) => s.date === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const eventsOn = (d: string) => events.filter((e) => e.start <= d && e.end >= d);

  const step = (n: number) => {
    if (view === "month") setMonth(shiftMonth(month, n));
    else {
      const w = addDays(week, n * 7);
      setWeek(w);
      setMonth(addDays(w, 3).slice(0, 7));
    }
  };
  const goToday = () => {
    setMonth(today.slice(0, 7));
    setWeek(weekStart(today));
  };
  const openWeek = (d: string) => {
    setWeek(weekStart(d));
    setView("week");
  };

  const first = `${month}-01`;
  const gridStart = weekStart(first);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = addDays(last, 6 - toDate(last).getUTCDay());
  const monthDays: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) monthDays.push(d);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const title = view === "month" ? monthLabel(month) : `${dayHead(week)} – ${dayHead(addDays(week, 6))}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md ring-1 ring-line">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                if (v === "week" && view === "month") setWeek(weekStart(month === today.slice(0, 7) ? today : `${month}-01`));
                setView(v);
              }}
              className={`px-3 py-1.5 text-sm ${view === v ? "bg-ink text-white" : "bg-white"}`}
            >
              {v === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
        <button onClick={() => step(-1)} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" aria-label="Back">
          ←
        </button>
        <button onClick={goToday} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line">
          Today
        </button>
        <button onClick={() => step(1)} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" aria-label="Forward">
          →
        </button>
        <h2 className="ml-2 font-display text-2xl">{title}</h2>
        {mine && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={justMe} onChange={(e) => setJustMe(e.target.checked)} />
            Just my shifts
          </label>
        )}
      </div>

      {view === "month" ? (
        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-line">
          <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs uppercase tracking-wider text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((d) => {
              const list = onDay(d);
              const evs = eventsOn(d);
              const inMonth = d.slice(0, 7) === month;
              return (
                <div
                  key={d}
                  onClick={() => (onAdd ? onAdd(d) : openWeek(d))}
                  title={onAdd ? addHint : "Open this week"}
                  className={`min-h-20 cursor-pointer border-b border-r border-line p-1 hover:bg-paper sm:min-h-28 ${inMonth ? "" : "bg-paper/60 text-muted"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-xs ${d === today ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white" : ""}`}>{Number(d.slice(8))}</span>
                  </div>
                  <div className="space-y-0.5">
                    {evs.map((e) => (
                      <div key={e.id} title={e.title} className={`truncate rounded px-1 text-[10px] ring-1 ${EVENT_CHIP}`}>
                        {e.title}
                      </div>
                    ))}
                    {list.map((s) => (
                      <button
                        key={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShift(s);
                        }}
                        title={`${s.assistantName ?? "Open shift"} · ${shiftTime(s)}${s.title ? ` · ${s.title}` : ""}${s.coordinateWith ? ` · coordinate with ${s.coordinateWith}` : ""}`}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ring-1 ${shiftChip(s)} ${mine && s.assistantEmail === mine ? "font-semibold ring-2" : ""}`}
                      >
                        <span className="hidden sm:inline">{s.timeTbd ? "TBD" : clock(s.startTime)} </span>
                        {firstName(s.assistantName)}
                        {s.swapOpen && " ⇄"}
                        {s.kind !== "standard" && <span className="ml-1 opacity-70">★</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <WeekGrid days={weekDays} today={today} shiftsOn={onDay} eventsOn={eventsOn} mine={mine} onShift={onShift} onAdd={onAdd} />
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          <span className={`mr-1 inline-block h-3 w-5 rounded align-middle ${OPEN_CHIP}`} />
          Open shift (nobody yet)
        </span>
        <span>⇄ swap requested</span>
        <span>★ {SHIFT_KINDS.filter((k) => k.id !== "standard").map((k) => k.label).join(", ")}</span>
        <span>
          <span className={`mr-1 inline-block h-3 w-5 rounded align-middle ring-1 ${EVENT_CHIP}`} />
          Gallery calendar event
        </span>
        {view === "month" && !onAdd && <span>Click a day to see its week.</span>}
      </div>
    </div>
  );
}

function WeekGrid({
  days,
  today,
  shiftsOn,
  eventsOn,
  mine,
  onShift,
  onAdd,
}: {
  days: string[];
  today: string;
  shiftsOn: (d: string) => CalShift[];
  eventsOn: (d: string) => CalEvent[];
  mine?: string;
  onShift: (s: CalShift) => void;
  onAdd?: (date: string, start?: string) => void;
}) {
  const all = days.flatMap(shiftsOn);
  const startHour = Math.min(9, ...all.map((s) => Math.floor(mins(s.startTime) / 60)));
  const endHour = Math.max(19, ...all.map((s) => Math.ceil(mins(s.endTime) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, n) => startHour + n);
  return (
    <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-line">
      <div className="min-w-[760px]">
        <div className="grid border-b border-line bg-paper" style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`border-l border-line px-2 py-2 text-xs ${d === today ? "font-semibold text-ink" : "text-muted"}`}>
              {dayHead(d)}
              {eventsOn(d).map((e) => (
                <div key={e.id} title={e.title} className={`mt-1 truncate rounded px-1 text-[10px] font-normal ring-1 ${EVENT_CHIP}`}>
                  {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}>
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, n) => (
              <span key={h} className="absolute right-1 text-[10px] text-muted" style={{ top: n * HOUR_PX + 2 }}>
                {clock(`${String(h).padStart(2, "0")}:00`)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const placed = lanes(shiftsOn(d));
            return (
              <div key={d} className="relative border-l border-line" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, n) => (
                  <div
                    key={h}
                    onClick={() => onAdd?.(d, `${String(h).padStart(2, "0")}:00`)}
                    className={`absolute left-0 right-0 border-t border-line/70 ${onAdd ? "cursor-pointer hover:bg-paper" : ""}`}
                    style={{ top: n * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {placed.map(({ s, lane, of }) => {
                  const top = ((mins(s.startTime) - startHour * 60) / 60) * HOUR_PX;
                  const height = Math.max(((mins(s.endTime) - mins(s.startTime)) / 60) * HOUR_PX - 2, 20);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onShift(s)}
                      className={`absolute flex flex-col justify-start overflow-hidden rounded px-1.5 py-1 text-left text-[11px] leading-tight ring-1 ${shiftChip(s)} ${mine && s.assistantEmail === mine ? "ring-2" : ""} ${s.timeTbd ? "border border-dashed border-ink/40" : ""}`}
                      style={{ top: top + 1, height, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)` }}
                    >
                      <span className="block truncate font-medium">
                        {s.assistantName ?? "Open shift"}
                        {s.swapOpen && " ⇄"}
                      </span>
                      <span className="block truncate opacity-80">{shiftTime(s)}</span>
                      {s.kind !== "standard" && <span className="block truncate opacity-80">★ {s.title || SHIFT_KINDS.find((k) => k.id === s.kind)?.label}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Overlapping shifts sit side by side. */
function lanes(list: CalShift[]) {
  const out = list.map((s) => ({ s, a: mins(s.startTime), b: mins(s.endTime), lane: 0, of: 1 }));
  let cluster: typeof out = [];
  const close = () => cluster.forEach((x) => (x.of = Math.max(...cluster.map((y) => y.lane)) + 1));
  for (const x of out) {
    if (cluster.length && x.a >= Math.max(...cluster.map((y) => y.b))) {
      close();
      cluster = [];
    }
    const used = new Set(cluster.filter((y) => y.b > x.a).map((y) => y.lane));
    while (used.has(x.lane)) x.lane++;
    cluster.push(x);
  }
  close();
  return out;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
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
