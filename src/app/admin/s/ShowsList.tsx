"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STAGES, type ShowFacts, type StageKey } from "@/lib/stages";
import { createShow } from "../actions";

type Row = { id: string; name: string; type: string; opensOn: string | null; closesOn: string | null; open: boolean; facts: ShowFacts; current: StageKey; past: boolean };

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : null);

/** What each card says about where a show is. */
function summary(r: Row) {
  const f = r.facts;
  switch (r.current) {
    case "call":
      return r.open ? "Open, no submissions yet" : "Not open yet";
    case "review":
      return `${f.applicants} applications, ${f.works} works${r.open ? " · open" : ""}`;
    case "curate":
      return `${f.sandbox} works in the sandbox`;
    case "notify":
      return `${f.selected} works selected · ${f.notified} artists emailed`;
    case "install":
      return `${f.received} of ${f.selected} works dropped off`;
    case "close":
      return r.past ? `Closed · ${f.selected} works` : `On view · ${f.selected} works`;
  }
}

export function ShowsList({ shows }: { shows: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"Volume" | "Takeover">("Volume");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sortKey = (r: Row) => r.opensOn ?? "9999";
  const current = shows.filter((r) => !r.past).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.name.localeCompare(b.name));
  const past = shows.filter((r) => r.past).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const create = () =>
    start(async () => {
      setError(null);
      try {
        const id = await createShow(name, type);
        router.push(`/admin/s/${id}/call`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
          <h1 className="font-display text-4xl">Shows</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Each show has one page with six steps, from the open call to pick-up. Open a show to land on the step it&rsquo;s on now.</p>
        </div>
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input id="new-show-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="New show, e.g. Volume V" className="w-56 rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
          <select id="new-show-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-line">
            <option>Volume</option>
            <option>Takeover</option>
          </select>
          <button disabled={pending || !name.trim()} className="rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-40">
            Create
          </button>
          {error && <span className="w-full text-rose-700">{error}</span>}
        </form>
      </section>
      <ul className="grid gap-3">
        {current.map((r) => (
          <ShowRow key={r.id} r={r} />
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-xs uppercase tracking-wider text-muted">Past shows</h2>
          <ul className="grid gap-3">
            {past.map((r) => (
              <ShowRow key={r.id} r={r} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function ShowRow({ r }: { r: Row }) {
  const at = STAGES.findIndex((s) => s.key === r.current);
  const dates = [r.opensOn && `Opens ${fmt(r.opensOn)}`, r.closesOn && `closes ${fmt(r.closesOn)}`].filter(Boolean).join(", ");
  return (
    <li>
      <Link href={`/admin/s/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-white p-4 ring-1 ring-line transition hover:ring-ink/40">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {r.type}
            {dates ? ` · ${dates}` : ""}
          </p>
          <p className="font-display text-2xl">{r.name}</p>
          <p className="text-sm text-muted">{summary(r)}</p>
        </div>
        <ol className="flex items-center gap-1" aria-label={`On step ${at + 1}: ${STAGES[at].label}`}>
          {STAGES.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1">
              <span
                title={s.label}
                className={`flex h-6 items-center rounded-full px-2 text-xs ${i < at || r.past ? "bg-emerald-600 text-white" : i === at ? "bg-ink text-white" : "bg-paper text-muted ring-1 ring-line"}`}
              >
                {i === at && !r.past ? s.label : i + 1}
              </span>
            </li>
          ))}
        </ol>
      </Link>
    </li>
  );
}
