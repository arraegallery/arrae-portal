"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardData, DashItem } from "@/lib/dashboard";
import { saveDashboardLayout } from "./dashboard-actions";

type Mod = { id: string; label: string; href: string };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 86400000));
const monthLabel = (m: string) => toDate(`${m}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => toDate(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shiftMonth = (m: string, n: number) => {
  const d = toDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};

function ago(at: string) {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Remembers a small per-viewer choice (like Month or List) in this browser. */
function useLocal<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(s as T);
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set] as const;
}

export function Dashboard({ layout: initial, data, modules }: { layout: (string | null)[]; data: DashboardData; modules: Mod[] }) {
  const [layout, setLayout] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const save = (next: (string | null)[]) => {
    setLayout(next);
    start(() => saveDashboardLayout(next));
  };
  const setSlot = (i: number, id: string | null) => save(layout.map((x, j) => (j === i ? id : x)));
  const addRow = () => save([...layout, null, null, null]);
  const lastRowEmpty = layout.length > 3 && layout.slice(-3).every((x) => !x);
  const today = new Date(`${data.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{today}</p>
          <h1 className="font-display text-4xl">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {editing && lastRowEmpty && (
            <button onClick={() => save(layout.slice(0, -3))} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
              Remove empty row
            </button>
          )}
          {editing && layout.length < 15 && (
            <button onClick={addRow} className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line hover:bg-paper">
              + Add a row
            </button>
          )}
          <button onClick={() => setEditing(!editing)} className={`rounded-md px-3 py-1.5 ring-1 ${editing ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:bg-paper"}`}>
            {editing ? "Done" : "Customize"}
          </button>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {layout.map((id, i) => {
          const mod = modules.find((m) => m.id === id);
          return (
            <Card key={i} mod={mod} editing={editing} modules={modules} onPick={(x) => setSlot(i, x)}>
              {mod?.id === "messages" && <MessagesModule inbox={data.inbox} />}
              {mod?.id === "team" && <CalendarModule items={data.team} today={data.today} storeKey="dash:team" empty="No shifts scheduled." />}
              {mod?.id === "gallery" && <CalendarModule items={data.gallery} today={data.today} storeKey="dash:gallery" empty="Nothing on the gallery calendar." />}
              {mod?.id === "activity" && <ActivityModule rows={data.activity} />}
              {mod?.id === "submissions" && <SubmissionsModule rows={data.submissions} />}
              {mod?.id === "dates" && <DatesModule rows={data.dates} today={data.today} />}
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function Card({ mod, editing, modules, onPick, children }: { mod?: Mod; editing: boolean; modules: Mod[]; onPick: (id: string | null) => void; children: React.ReactNode }) {
  const picker = (
    <select
      value={mod?.id ?? ""}
      onChange={(e) => onPick(e.target.value || null)}
      aria-label="Card"
      className="rounded-md bg-white px-2 py-1 text-xs ring-1 ring-line"
    >
      <option value="">Empty space</option>
      {modules.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
  if (!mod)
    return (
      <section className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-sm text-muted">
        {editing ? (
          <>
            <span>Put a card here</span>
            {picker}
          </>
        ) : (
          <span className="text-xs">Space for another card. Click Customize to add one.</span>
        )}
      </section>
    );
  return (
    <section className="flex h-[420px] flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {mod.href ? (
          <Link href={mod.href} className="font-display text-xl hover:underline">
            {mod.label}
          </Link>
        ) : (
          <h2 className="font-display text-xl">{mod.label}</h2>
        )}
        <span className="ml-auto">{editing ? picker : mod.href ? <Link href={mod.href} className="text-xs text-muted hover:text-ink">Open →</Link> : null}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

function MessagesModule({ inbox }: { inbox: DashboardData["inbox"] }) {
  if (!inbox.length) return <Empty>No messages yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {inbox.map((c) => (
        <li key={c.artistId}>
          <Link href={c.href} className="flex gap-3 px-4 py-2.5 hover:bg-paper">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-xs font-medium ring-1 ring-line">
              {c.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className={`truncate text-sm ${c.unread ? "font-semibold" : ""}`}>{c.name}</span>
                {c.unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-medium text-white">{c.unread}</span>}
                <span className="ml-auto shrink-0 text-xs text-muted">{ago(c.last.at)}</span>
              </span>
              <span className="block truncate text-xs text-muted">
                {c.last.sender === "artist" ? "" : "You: "}
                {c.last.body}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CalendarModule({ items, today, storeKey, empty }: { items: DashItem[]; today: string; storeKey: string; empty: string }) {
  const [view, setView] = useLocal<"month" | "list">(`${storeKey}:view`, "month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const on = (d: string) => items.filter((i) => i.date <= d && (i.end ?? i.date) >= d);
  const cells = useMemo(() => {
    const first = `${month}-01`;
    const start = addDays(first, -toDate(first).getUTCDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || d.slice(0, 7) === month);
  }, [month]);
  const upcoming = useMemo(() => {
    const until = addDays(today, 30);
    const days: { d: string; list: DashItem[] }[] = [];
    for (let d = today; d <= until; d = addDays(d, 1)) {
      // Multi-day entries show on their first day, or today if they started earlier.
      const list = items.filter((i) => (i.date === d || (d === today && i.date < d && (i.end ?? i.date) >= d)));
      if (list.length) days.push({ d, list });
    }
    return days;
  }, [items, today]);

  const toggle = (
    <div className="flex rounded-md bg-paper p-0.5 text-xs ring-1 ring-line">
      {(["month", "list"] as const).map((v) => (
        <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-0.5 ${view === v ? "bg-white shadow-sm ring-1 ring-line" : "text-muted"}`}>
          {v === "month" ? "Month" : "List"}
        </button>
      ))}
    </div>
  );

  if (view === "list")
    return (
      <div>
        <div className="sticky top-0 flex items-center justify-between bg-white px-4 py-2">
          <span className="text-xs text-muted">Next 30 days</span>
          {toggle}
        </div>
        {!upcoming.length ? (
          <Empty>{empty}</Empty>
        ) : (
          <ul className="px-4 pb-3">
            {upcoming.map(({ d, list }) => (
              <li key={d} className="border-t border-line py-2 first:border-t-0">
                <p className={`text-xs font-medium ${d === today ? "text-red-700" : "text-muted"}`}>{d === today ? `Today · ${dayLabel(d)}` : dayLabel(d)}</p>
                <Rows list={list} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  const picked = on(day);
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-1">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink">
          ‹
        </button>
        <span className="text-sm font-medium">{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink">
          ›
        </button>
        {month !== today.slice(0, 7) && (
          <button onClick={() => (setMonth(today.slice(0, 7)), setDay(today))} className="ml-1 text-xs text-muted underline">
            Today
          </button>
        )}
        <span className="ml-auto">{toggle}</span>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[10px] text-muted">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const list = on(d);
          const out = d.slice(0, 7) !== month;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`flex h-9 flex-col items-center justify-start rounded pt-0.5 text-xs ${d === day ? "bg-ink text-white" : d === today ? "bg-red-50 text-red-800" : "hover:bg-paper"} ${out ? "opacity-40" : ""}`}
            >
              {Number(d.slice(8))}
              <span className="mt-0.5 flex gap-0.5">
                {list.slice(0, 3).map((it, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${it.dot}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 border-t border-line pt-2">
        <p className="text-xs font-medium text-muted">{day === today ? `Today · ${dayLabel(day)}` : dayLabel(day)}</p>
        {picked.length ? <Rows list={picked} /> : <p className="py-1 text-xs text-muted">Nothing this day.</p>}
      </div>
    </div>
  );
}

function Rows({ list }: { list: DashItem[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {list.map((it, i) => {
        const inner = (
          <>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.dot}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{it.title}</span>
              {(it.sub || it.end) && (
                <span className="block truncate text-xs text-muted">
                  {[it.sub, it.end ? `through ${dayLabel(it.end)}` : ""].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={i}>
            {it.href ? (
              <Link href={it.href} className="-mx-1 flex gap-2 rounded px-1 hover:bg-paper">
                {inner}
              </Link>
            ) : (
              <div className="flex gap-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ActivityModule({ rows }: { rows: DashboardData["activity"] }) {
  if (!rows.length) return <Empty>No activity yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="block text-sm">
              {r.artist && <span className="font-medium">{r.artist}: </span>}
              {r.body}
            </span>
            <span className="block text-xs text-muted">
              {ago(r.at)}
              {r.actor ? ` · ${r.actor === "artist" ? "by the artist" : r.actor}` : ""}
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="block px-4 py-2 hover:bg-paper">
                {inner}
              </Link>
            ) : (
              <div className="px-4 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SubmissionsModule({ rows }: { rows: DashboardData["submissions"] }) {
  if (!rows.length) return <Empty>No submissions yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="flex gap-2 px-4 py-2 hover:bg-paper">
            {r.unseen && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" title="New since you last looked" />}
            <span className="min-w-0">
              <span className="block text-sm">
                <span className="font-medium">{r.artist}</span> · {r.body}
              </span>
              <span className="block text-xs text-muted">{ago(r.at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DatesModule({ rows, today }: { rows: DashItem[]; today: string }) {
  if (!rows.length) return <Empty>No upcoming show dates. Add them in Show settings.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r, i) => {
        const days = Math.round((toDate(r.date).getTime() - toDate(today).getTime()) / 86400000);
        return (
          <li key={i}>
            <Link href={r.href ?? "/admin/shows"} className="flex items-center gap-3 px-4 py-2 hover:bg-paper">
              <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.title}</span>
                <span className="block text-xs text-muted">{dayLabel(r.date)}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
