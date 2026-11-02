"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createShow, updateShow } from "../actions";
import type { getShowsAdmin } from "@/lib/queries";

type Show = Awaited<ReturnType<typeof getShowsAdmin>>[number];
const TYPES = ["Volume", "Takeover", "ARRAE Finds"] as const;
const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";

export function ShowsManager({ shows }: { shows: Show[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("Volume");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      setError(null);
      try {
        await createShow(name, type);
        setName("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Shows</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Create a show, set its dates, and open it to artists. While a show is open, artists see it in their studio and can submit new works or put past works forward. Decisions stay
          hidden from artists (they see &ldquo;Under review&rdquo;) until you release them.
        </p>
      </section>

      <section className="mb-8 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 ring-1 ring-line">
        <label className="min-w-64 flex-1 text-xs text-muted">
          New show name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Volume V" className={input} />
        </label>
        <label className="text-xs text-muted">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className={input}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button onClick={create} disabled={!name.trim() || pending} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
          Create show
        </button>
        {error && <p className="w-full text-sm text-rose-700">{error}</p>}
      </section>

      <ul className="space-y-4">
        {shows.map((s) => (
          <ShowCard key={s.id} show={s} />
        ))}
      </ul>
    </main>
  );
}

function ShowCard({ show }: { show: Show }) {
  const router = useRouter();
  const initial = {
    name: show.name,
    type: show.type as string,
    opensOn: show.opensOn ?? "",
    closesOn: show.closesOn ?? "",
    applicationDeadline: show.applicationDeadline ?? "",
    decisionsDueOn: show.decisionsDueOn ?? "",
    description: show.description ?? "",
  };
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [flags, setFlags] = useState({ openForSubmissions: show.openForSubmissions, decisionsReleased: show.decisionsReleased });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = (Object.keys(f) as (keyof typeof f)[]).filter((k) => f[k] !== saved[k]);
  const save = () =>
    start(async () => {
      setMsg(null);
      try {
        await updateShow(show.id, Object.fromEntries(dirty.map((k) => [k, f[k]])));
        setSaved(f);
        setMsg("Saved");
        router.refresh();
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  const flip = (k: keyof typeof flags) => {
    const next = !flags[k];
    if (k === "decisionsReleased" && next && !confirm(`Release ${show.name} decisions? Artists will see Selected, Waitlist or Not selected in their studio right away.`)) return;
    setFlags({ ...flags, [k]: next });
    start(async () => {
      try {
        await updateShow(show.id, { [k]: next });
        router.refresh();
      } catch (e) {
        setFlags({ ...flags });
        setMsg((e as Error).message);
      }
    });
  };
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="text-xs text-muted">
      {label}
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} />
    </label>
  );
  return (
    <li className="rounded-lg bg-white p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl">{saved.name}</h2>
        <span className="text-xs text-muted">{saved.type}</span>
        <span className="text-xs text-muted">
          {show.artists} artists · {show.works} works · {show.selectedWorks} selected
        </span>
        <span className="ml-auto flex gap-2 text-sm">
          <Link href={`/admin/review/${show.id}`} className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-paper">
            Review board
          </Link>
          <Link href={`/admin/sandbox/${show.id}`} className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-paper">
            Sandbox
          </Link>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button onClick={() => flip("openForSubmissions")} disabled={pending} className={`rounded-full px-3 py-1 ring-1 ${flags.openForSubmissions ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white ring-line"}`}>
          {flags.openForSubmissions ? "✓ Open to artist submissions" : "Closed to submissions (click to open)"}
        </button>
        <button onClick={() => flip("decisionsReleased")} disabled={pending} className={`rounded-full px-3 py-1 ring-1 ${flags.decisionsReleased ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white ring-line"}`}>
          {flags.decisionsReleased ? "✓ Decisions visible to artists" : "Decisions hidden from artists"}
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">Name, dates and the note artists see</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {field("name", "Name")}
          <label className="text-xs text-muted">
            Type
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {field("applicationDeadline", "Submission deadline", "date")}
          {field("decisionsDueOn", "Decisions due", "date")}
          {field("opensOn", "Opens", "date")}
          {field("closesOn", "Closes", "date")}
          <label className="text-xs text-muted sm:col-span-3">
            Note to artists (shown in their studio while the show is open)
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${input} h-20`} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {msg && <span className="text-xs text-muted">{msg}</span>}
          <button onClick={save} disabled={!dirty.length || pending} className="ml-auto rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-40">
            Save
          </button>
        </div>
      </details>
    </li>
  );
}
