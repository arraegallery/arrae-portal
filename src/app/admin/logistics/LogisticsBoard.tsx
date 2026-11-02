"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { getLogistics } from "@/lib/logistics";
import {
  bookForArtist,
  cancelBooking,
  createBookingWindow,
  deleteBookingWindow,
  markWorks,
  remindToBook,
  resetCalendarLink,
  setBookingWindowOpen,
  updateBookingWindow,
  type WindowInput,
} from "./actions";

type Data = Awaited<ReturnType<typeof getLogistics>>;
type Win = Data["windows"][number];

const TZ = "America/New_York";
const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND = { dropoff: "Drop-off", pickup: "Pick-up" } as const;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return { run, pending, error };
}

export function LogisticsBoard({ windows, shows, owner, feedUrl }: Data & { owner: boolean; feedUrl: string | null }) {
  const [adding, setAdding] = useState(windows.length === 0);
  const [showClosed, setShowClosed] = useState(false);
  const shown = windows.filter((w) => w.open || showClosed);
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">Logistics</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Set the days and hours for drop-offs and pick-ups. Artists with works selected for that show pick a time in their studio, and you mark each work as it comes in or goes home.
          </p>
        </div>
        <button onClick={() => setAdding(!adding)} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
          {adding ? "Close" : "+ New drop-off or pick-up"}
        </button>
      </section>

      {adding && <WindowForm shows={shows} onDone={() => setAdding(false)} />}
      <CalendarLink feedUrl={feedUrl} owner={owner} />

      {windows.some((w) => !w.open) && (
        <label className="mt-6 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ones too
        </label>
      )}
      <div className="mt-4 space-y-8">
        {shown.map((w) => (
          <WindowCard key={w.id} w={w} shows={shows} owner={owner} />
        ))}
        {!windows.length && !adding && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
      </div>
    </main>
  );
}

function blankWindow(showId: string): WindowInput {
  return { showId, kind: "dropoff", startsOn: "", endsOn: "", dayStart: "11:00", dayEnd: "17:00", weekdays: [2, 3, 4, 5, 6], slotMinutes: 30, capacity: 1, location: "", note: "" };
}

function WindowForm({ shows, initial, windowId, onDone }: { shows: Data["shows"]; initial?: WindowInput; windowId?: number; onDone: () => void }) {
  const [f, setF] = useState<WindowInput>(initial ?? blankWindow(shows.find((x) => x.id === "volume-iv")?.id ?? shows[0]?.id ?? ""));
  const { run, pending, error } = useRun();
  const set = <K extends keyof WindowInput>(k: K, v: WindowInput[K]) => setF({ ...f, [k]: v });
  return (
    <section className="mb-6 rounded-lg bg-white p-4 ring-1 ring-line">
      <h2 className="text-xs uppercase tracking-wider text-muted">{windowId ? "Change these times" : "New drop-off or pick-up"}</h2>
      <div className="mt-3 grid grid-cols-6 gap-3">
        <label className="col-span-6 text-xs text-muted sm:col-span-3">
          Show
          <select value={f.showId} onChange={(e) => set("showId", e.target.value)} className={input} disabled={!!windowId}>
            {shows.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-6 text-xs text-muted sm:col-span-3">
          What for
          <div className="mt-1 flex gap-2">
            {(["dropoff", "pickup"] as const).map((k) => (
              <button key={k} disabled={!!windowId} onClick={() => set("kind", k)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${f.kind === k ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line"}`}>
                {KIND[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="col-span-3 text-xs text-muted sm:col-span-2">
          First day
          <input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value, endsOn: f.endsOn && f.endsOn >= e.target.value ? f.endsOn : e.target.value })} className={input} />
        </label>
        <label className="col-span-3 text-xs text-muted sm:col-span-2">
          Last day
          <input type="date" value={f.endsOn} min={f.startsOn} onChange={(e) => set("endsOn", e.target.value)} className={input} />
        </label>
        <div className="col-span-6 text-xs text-muted sm:col-span-2">
          Days of the week
          <div className="mt-1 flex flex-wrap gap-1">
            {DAYS.map((d, i) => {
              const on = f.weekdays.includes(i);
              return (
                <button key={d} onClick={() => set("weekdays", on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i])} className={`rounded px-1.5 py-1 text-xs ring-1 ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <label className="col-span-3 text-xs text-muted sm:col-span-1">
          From
          <input type="time" value={f.dayStart} onChange={(e) => set("dayStart", e.target.value)} className={input} />
        </label>
        <label className="col-span-3 text-xs text-muted sm:col-span-1">
          Until
          <input type="time" value={f.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} className={input} />
        </label>
        <label className="col-span-3 text-xs text-muted sm:col-span-2">
          Each appointment
          <select value={f.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))} className={input}>
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-3 text-xs text-muted sm:col-span-2">
          Artists per time slot
          <input type="number" min={1} max={20} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} className={input} />
        </label>
        <label className="col-span-6 text-xs text-muted">
          Where
          <input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="ARRAE Gallery, address, which door to use" className={input} />
        </label>
        <label className="col-span-6 text-xs text-muted">
          Note to artists (optional)
          <textarea value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Please bring works wired and ready to hang, with a label on the back." className={`${input} h-16`} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button onClick={onDone} className="ml-auto rounded-md px-3 py-1.5 text-sm ring-1 ring-line">
          Cancel
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => (windowId ? updateBookingWindow(windowId, f) : createBookingWindow(f)), onDone)}
          className="rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : windowId ? "Save" : "Open for booking"}
        </button>
      </div>
    </section>
  );
}

function CalendarLink({ feedUrl, owner }: { feedUrl: string | null; owner: boolean }) {
  const { run, pending, error } = useRun();
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">See bookings in Google Calendar</h2>
        <button onClick={() => setHelp(!help)} className="text-xs text-muted underline">
          {help ? "Hide steps" : "How?"}
        </button>
      </div>
      {feedUrl ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md bg-paper px-2 py-1.5 font-mono text-xs ring-1 ring-line" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(feedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-white"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {owner && (
            <button disabled={pending} onClick={() => confirm("Make a new link? The old one stops working, so you'll need to add the new one to Google Calendar again.") && run(resetCalendarLink)} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-line">
              New link
            </button>
          )}
        </div>
      ) : owner ? (
        <button disabled={pending} onClick={() => run(resetCalendarLink)} className="mt-2 rounded-md bg-ink px-3 py-1.5 text-xs text-white">
          Create my calendar link
        </button>
      ) : (
        <p className="mt-2 text-muted">An owner can create the calendar link here.</p>
      )}
      {help && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted">
          <li>Click Copy link above.</li>
          <li>On a computer, open calendar.google.com.</li>
          <li>In the left column, next to &ldquo;Other calendars&rdquo;, click the + sign.</li>
          <li>Click &ldquo;From URL&rdquo;.</li>
          <li>Paste the link into &ldquo;URL of calendar&rdquo; and click &ldquo;Add calendar&rdquo;.</li>
          <li>&ldquo;ARRAE drop-offs &amp; pick-ups&rdquo; now appears under Other calendars. Google refreshes it on its own, usually within a few hours.</li>
        </ol>
      )}
      <p className="mt-2 text-xs text-muted">Keep this link private: anyone with it can see the schedule.</p>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}

function WindowCard({ w, shows, owner }: { w: Win; shows: Data["shows"]; owner: boolean }) {
  const { run, pending, error } = useRun();
  const [editing, setEditing] = useState(false);
  const what = w.kind === "dropoff" ? "received" : "pickedUp";
  const doneLabel = w.kind === "dropoff" ? "Received" : "Picked up";
  const days = new Map<string, Win["bookings"]>();
  for (const b of w.bookings) days.set(fmtDay(b.start), [...(days.get(fmtDay(b.start)) ?? []), b]);
  const totalWorks = [...w.bookings, ...w.unbooked].reduce((n, x) => n + x.works.length, 0);
  const doneWorks = [...w.bookings, ...w.unbooked].reduce((n, x) => n + x.works.filter((wk) => (w.kind === "dropoff" ? wk.receivedAt : wk.pickedUpAt)).length, 0);
  if (editing)
    return (
      <WindowForm
        shows={shows}
        windowId={w.id}
        initial={{ showId: w.showId, kind: w.kind, startsOn: w.startsOn, endsOn: w.endsOn, dayStart: w.dayStart, dayEnd: w.dayEnd, weekdays: w.weekdays.split(",").map(Number), slotMinutes: w.slotMinutes, capacity: w.capacity, location: w.location ?? "", note: w.note ?? "" }}
        onDone={() => setEditing(false)}
      />
    );
  return (
    <section className={`rounded-lg bg-white ring-1 ring-line ${w.open ? "" : "opacity-70"}`}>
      <header className="flex flex-wrap items-start gap-3 border-b border-line p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">
            {w.show} · {KIND[w.kind]}
          </p>
          <h2 className="font-display text-2xl">{w.summary}</h2>
          <p className="text-xs text-muted">
            {w.weekdays
              .split(",")
              .map((d) => DAYS[Number(d)])
              .join(", ")}
            {w.capacity > 1 ? ` · ${w.capacity} artists per slot` : ""}
            {w.location ? ` · ${w.location}` : ""}
          </p>
          <p className="mt-1 text-sm">
            {w.bookings.length} of {w.bookings.length + w.unbooked.length} artists booked · {doneWorks} of {totalWorks} works {doneLabel.toLowerCase()}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <button disabled={pending} onClick={() => run(() => setBookingWindowOpen(w.id, !w.open))} className={`rounded-full px-3 py-1 ring-1 ${w.open ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "ring-line"}`}>
            {w.open ? "Open for booking" : "Closed (click to open)"}
          </button>
          <button onClick={() => setEditing(true)} className="rounded-md px-3 py-1 ring-1 ring-line">
            Change times
          </button>
          {owner && (
            <button disabled={pending} onClick={() => confirm(`Delete this ${KIND[w.kind].toLowerCase()} calendar and its ${w.bookings.length} bookings?`) && run(() => deleteBookingWindow(w.id))} className="rounded-md px-3 py-1 text-rose-700 ring-1 ring-rose-200">
              Delete
            </button>
          )}
        </div>
        {error && <p className="w-full text-sm text-rose-700">{error}</p>}
      </header>

      <div className="divide-y divide-line">
        {[...days.entries()].map(([day, list]) => (
          <div key={day} className="p-4">
            <h3 className="text-sm font-medium">{day}</h3>
            <ul className="mt-2 space-y-3">
              {list.map((b) => (
                <BookingRow key={b.id} b={b} w={w} what={what} doneLabel={doneLabel} />
              ))}
            </ul>
          </div>
        ))}
        {!w.bookings.length && <p className="p-4 text-sm text-muted">No bookings yet.</p>}
      </div>

      {w.unbooked.length > 0 && (
        <div className="border-t border-line bg-paper/60 p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted">Haven&rsquo;t picked a time yet ({w.unbooked.length})</h3>
          <ul className="mt-2 space-y-2">
            {w.unbooked.map((u) => (
              <UnbookedRow key={u.artistId} u={u} w={w} what={what} doneLabel={doneLabel} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function WorkTicks({ works, w, what, doneLabel }: { works: Win["bookings"][number]["works"]; w: Win; what: "received" | "pickedUp"; doneLabel: string }) {
  const { run, pending, error } = useRun();
  const done = (wk: (typeof works)[number]) => !!(what === "received" ? wk.receivedAt : wk.pickedUpAt);
  const left = works.filter((wk) => !done(wk));
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap gap-1.5">
        {works.map((wk) => (
          <label key={wk.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${done(wk) ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-white ring-line"}`}>
            <input type="checkbox" disabled={pending} checked={done(wk)} onChange={(e) => run(() => markWorks(w.showId, [wk.id], what, e.target.checked))} />
            {wk.title}
          </label>
        ))}
        {left.length > 1 && (
          <button disabled={pending} onClick={() => run(() => markWorks(w.showId, left.map((x) => x.id), what, true))} className="rounded-full px-2.5 py-1 text-xs underline">
            Mark all {doneLabel.toLowerCase()}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function BookingRow({ b, w, what, doneLabel }: { b: Win["bookings"][number]; w: Win; what: "received" | "pickedUp"; doneLabel: string }) {
  const { run, pending, error } = useRun();
  const [moving, setMoving] = useState(false);
  return (
    <li className="rounded-md p-2 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="w-20 shrink-0 font-medium">{fmtTime(b.start)}</span>
        <Link href={`/admin/artists/${b.artistId}`} className="font-medium hover:underline">
          {b.artist?.name ?? b.artistId}
        </Link>
        <span className="text-xs text-muted">{[b.artist?.phone, b.artist?.email].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto flex gap-2 text-xs">
          <button onClick={() => setMoving(!moving)} className="text-muted underline">
            Change time
          </button>
          <button disabled={pending} onClick={() => confirm(`Cancel ${b.artist?.name}'s ${fmtTime(b.start)} booking? They aren't emailed about it.`) && run(() => cancelBooking(b.id))} className="text-rose-700 underline">
            Cancel
          </button>
        </span>
      </div>
      {b.note && <p className="ml-0 mt-1 text-xs text-muted sm:ml-[5.75rem]">&ldquo;{b.note}&rdquo;</p>}
      <div className="sm:ml-[5.75rem]">
        <WorkTicks works={b.works} w={w} what={what} doneLabel={doneLabel} />
        {moving && <SlotPicker w={w} label="Move to" onPick={(start) => run(() => bookForArtist(w.id, b.artistId, start), () => setMoving(false))} pending={pending} />}
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function UnbookedRow({ u, w, what, doneLabel }: { u: Win["unbooked"][number]; w: Win; what: "received" | "pickedUp"; doneLabel: string }) {
  const { run, pending, error } = useRun();
  const [booking, setBooking] = useState(false);
  const [reminded, setReminded] = useState(false);
  return (
    <li className="rounded-md bg-white p-2 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <Link href={`/admin/artists/${u.artistId}`} className="font-medium hover:underline">
          {u.artist?.name ?? u.artistId}
        </Link>
        <span className="text-xs text-muted">{[u.artist?.phone, u.artist?.email].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto flex gap-3 text-xs">
          <button onClick={() => setBooking(!booking)} className="underline">
            Book a time for them
          </button>
          <button disabled={pending || reminded} onClick={() => run(() => remindToBook(w.id, u.artistId), () => setReminded(true))} className="underline disabled:no-underline disabled:opacity-60">
            {reminded ? "Reminder sent" : "Send a reminder"}
          </button>
        </span>
      </div>
      <WorkTicks works={u.works} w={w} what={what} doneLabel={doneLabel} />
      {booking && <SlotPicker w={w} label="Book" onPick={(start) => run(() => bookForArtist(w.id, u.artistId, start), () => setBooking(false))} pending={pending} />}
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function SlotPicker({ w, label, onPick, pending }: { w: Win; label: string; onPick: (start: string) => void; pending: boolean }) {
  const [day, setDay] = useState(w.slots[0]?.date ?? "");
  const [start, setStart] = useState("");
  const slots = w.slots.find((d) => d.date === day)?.slots ?? [];
  if (!w.slots.length) return <p className="mt-2 text-xs text-muted">No times left in this window. Change the times to add more.</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select value={day} onChange={(e) => (setDay(e.target.value), setStart(""))} className="rounded-md bg-white px-2 py-1 ring-1 ring-line">
        {w.slots.map((d) => (
          <option key={d.date} value={d.date}>
            {fmtDate(d.date)}
          </option>
        ))}
      </select>
      <select value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md bg-white px-2 py-1 ring-1 ring-line">
        <option value="">Time…</option>
        {slots.map((x) => (
          <option key={x.start} value={x.start} disabled={x.left < 1}>
            {fmtTime(x.start)}
            {x.left < 1 ? " (full)" : ""}
          </option>
        ))}
      </select>
      <button disabled={!start || pending} onClick={() => onPick(start)} className="rounded-md bg-ink px-3 py-1 text-white disabled:opacity-40">
        {label}
      </button>
      <span className="text-muted">They get a confirmation email.</span>
    </div>
  );
}
