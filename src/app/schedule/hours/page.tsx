import { and, asc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { clock, galleryNow, requireAssistant, shortDate } from "@/lib/schedule";
import { hrs, semesters } from "@/lib/schedule-report";
import { DeleteLog } from "./DeleteLog";

export const metadata = { title: "My hours · ARRAE" };

export default async function MyHours({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { email, assistant } = await requireAssistant();
  const today = galleryNow().date;
  const presets = semesters(today);
  const sp = await searchParams;
  const current = presets.find((p) => p.from <= today && p.to >= today) ?? presets[0];
  const ok = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = ok(sp.from) ? sp.from! : current.from;
  const to = ok(sp.to) ? sp.to! : current.to;
  const logs = await db
    .select()
    .from(s.hourLogs)
    .where(and(eq(s.hourLogs.email, email), gte(s.hourLogs.date, from), lte(s.hourLogs.date, to)))
    .orderBy(asc(s.hourLogs.date), asc(s.hourLogs.startTime));
  const total = logs.reduce((n, l) => n + l.minutes, 0);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{assistant?.name ?? email}</p>
        <h1 className="font-display text-4xl">My hours</h1>
        <p className="mt-1 text-sm text-muted">
          {shortDate(from)} to {shortDate(to)}: <strong className="text-ink">{hrs(total)} hours</strong> logged.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {presets.map((p) => (
            <Link key={p.label} href={`/schedule/hours?from=${p.from}&to=${p.to}`} className={`rounded-md px-3 py-1.5 ring-1 ring-line ${p.from === from && p.to === to ? "bg-ink text-white" : "bg-white"}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </section>
      {logs.length ? (
        <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-32 shrink-0 font-medium">{shortDate(l.date)}</span>
              <span className="flex-1">
                {clock(l.startTime)}–{clock(l.endTime)}
                {(l.note || !l.shiftId) && <span className="block text-xs text-muted">{[l.shiftId ? null : "Extra hours", l.note].filter(Boolean).join(" · ")}</span>}
              </span>
              <span className="w-16 text-right">{hrs(l.minutes)} hrs</span>
              <DeleteLog id={l.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-white p-4 text-sm text-muted ring-1 ring-line">No hours logged in these dates.</p>
      )}
      <p className="mt-4 text-xs text-muted">Logged the wrong times? Delete the entry and log it again from your schedule page.</p>
    </main>
  );
}
