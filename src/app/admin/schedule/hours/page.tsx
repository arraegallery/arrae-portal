import Link from "next/link";
import { clock, galleryNow, shortDate } from "@/lib/schedule";
import { hoursReport, hrs, semesters } from "@/lib/schedule-report";
import { requireOwner } from "@/lib/team";

export const metadata = { title: "Hours report · ARRAE" };

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireOwner();
  const today = galleryNow().date;
  const presets = semesters(today);
  const sp = await searchParams;
  const current = presets.find((p) => p.from <= today && p.to >= today) ?? presets[0];
  const from = isDate(sp.from) ? sp.from! : current.from;
  const to = isDate(sp.to) ? sp.to! : current.to;
  const rows = await hoursReport(from, to);
  const total = rows.reduce((n, r) => n + r.loggedMinutes, 0);
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <Link href="/admin/schedule" className="text-xs uppercase tracking-[0.2em] text-muted hover:underline">
            ← Team schedule
          </Link>
          <h1 className="font-display text-4xl">Hours report</h1>
          <p className="mt-1 text-sm text-muted">
            Hours each Gallery Assistant logged between {shortDate(from)} and {shortDate(to)}, next to the hours they were scheduled for. {hrs(total)} hours logged in total.
          </p>
        </div>
        <a href={`/api/schedule/hours?from=${from}&to=${to}`} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
          Download spreadsheet (CSV)
        </a>
      </section>

      <form className="mb-6 flex flex-wrap items-end gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-line">
        {presets.map((p) => (
          <Link key={p.label} href={`/admin/schedule/hours?from=${p.from}&to=${p.to}`} className={`rounded-md px-3 py-1.5 ring-1 ring-line ${p.from === from && p.to === to ? "bg-ink text-white" : "bg-white"}`}>
            {p.label}
          </Link>
        ))}
        <label className="ml-auto text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={from} className="mt-0.5 block rounded-md px-2 py-1 ring-1 ring-line" />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={to} className="mt-0.5 block rounded-md px-2 py-1 ring-1 ring-line" />
        </label>
        <button className="rounded-md bg-white px-3 py-1.5 ring-1 ring-line">Show</button>
      </form>

      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Gallery Assistant</th>
              <th className="px-3 py-2 text-right">Shifts worked</th>
              <th className="px-3 py-2 text-right">Scheduled hours</th>
              <th className="px-3 py-2 text-right">Logged hours</th>
              <th className="px-3 py-2 text-right">Not logged yet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.email}>
                <td className="px-3 py-2">
                  {r.name}
                  {r.removed && <span className="ml-1 text-xs text-muted">(no longer on the team)</span>}
                </td>
                <td className="px-3 py-2 text-right">{r.shifts}</td>
                <td className="px-3 py-2 text-right">{hrs(r.scheduledMinutes)}</td>
                <td className="px-3 py-2 text-right font-semibold">{hrs(r.loggedMinutes)}</td>
                <td className={`px-3 py-2 text-right ${r.missing.length ? "text-rose-700" : "text-muted"}`}>{r.missing.length}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted">
                  No Gallery Assistants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.map((r) => (
        <details key={r.email} className="mt-4 rounded-lg bg-white p-3 ring-1 ring-line">
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">{r.name}</span> <span className="text-muted">· {r.logs.length} logged entries</span>
          </summary>
          {r.missing.length > 0 && (
            <p className="mt-2 text-xs text-rose-700">
              Shifts with no hours logged: {r.missing.map((m) => `${shortDate(m.date)} ${clock(m.startTime)}–${clock(m.endTime)}`).join("; ")}
            </p>
          )}
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-line">
              {r.logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-3">{shortDate(l.date)}</td>
                  <td className="py-1.5 pr-3">
                    {clock(l.startTime)}–{clock(l.endTime)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{hrs(l.minutes)} hrs</td>
                  <td className="py-1.5 text-muted">{l.shiftId ? "" : "Extra (not a scheduled shift) "}{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </main>
  );
}
