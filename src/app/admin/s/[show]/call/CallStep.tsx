"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateShow } from "../../../actions";

type Fields = { name: string; type: string; opensOn: string; closesOn: string; applicationDeadline: string; decisionsDueOn: string; description: string };
const input = "mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line";

export function CallStep({ show, applicants, works }: { show: Fields & { id: string; openForSubmissions: boolean }; applicants: number; works: number }) {
  const router = useRouter();
  const initial: Fields = { name: show.name, type: show.type, opensOn: show.opensOn, closesOn: show.closesOn, applicationDeadline: show.applicationDeadline, decisionsDueOn: show.decisionsDueOn, description: show.description };
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [open, setOpen] = useState(show.openForSubmissions);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = (Object.keys(f) as (keyof Fields)[]).filter((k) => f[k] !== saved[k]);
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      setMsg(null);
      try {
        await fn();
        setMsg({ ok: true, text: ok });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  const field = (k: keyof Fields, label: string, type = "text") => (
    <label className="text-xs text-muted">
      {label}
      <input id={`call-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} />
    </label>
  );
  return (
    <main className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 pb-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="rounded-xl bg-white p-5 ring-1 ring-line">
        <h2 className="font-display text-2xl">Dates and note to artists</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {field("name", "Name")}
          <label className="text-xs text-muted">
            Type
            <select id="call-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>
              <option>Volume</option>
              <option>Takeover</option>
            </select>
          </label>
          {field("applicationDeadline", "Submissions due", "date")}
          {field("decisionsDueOn", "Decisions due", "date")}
          {field("opensOn", "Opens", "date")}
          {field("closesOn", "Closes", "date")}
          <label className="text-xs text-muted sm:col-span-2">
            Note to artists (shown in their studio while the show is open)
            <textarea id="call-description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${input} h-24`} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
          <button
            disabled={!dirty.length || pending}
            onClick={() =>
              run(async () => {
                await updateShow(show.id, Object.fromEntries(dirty.map((k) => [k, f[k]])));
                setSaved(f);
              }, "Saved")
            }
            className="ml-auto rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className={`rounded-xl p-5 ring-1 ${open ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-line"}`}>
          <h2 className="font-display text-2xl">{open ? "Open to submissions" : "Closed to submissions"}</h2>
          <p className="mt-1 text-sm text-muted">
            {open
              ? "Artists see this show on the apply page and in their studio, and can send new works or put past works forward."
              : "Artists can't send works to this show right now. Anyone you invite to add more works still can."}
          </p>
          <button
            disabled={pending}
            onClick={() =>
              run(async () => {
                await updateShow(show.id, { openForSubmissions: !open });
                setOpen(!open);
              }, open ? "Closed to submissions" : "Opened to submissions")
            }
            className={`mt-3 rounded-md px-4 py-2 text-sm disabled:opacity-40 ${open ? "bg-white ring-1 ring-line" : "bg-ink text-white"}`}
          >
            {open ? "Close submissions" : "Open submissions"}
          </button>
        </section>
        <section className="rounded-xl bg-white p-5 text-sm ring-1 ring-line">
          <p>
            <b className="font-display text-2xl">{applicants}</b> <span className="text-muted">applications</span> · <b className="font-display text-2xl">{works}</b>{" "}
            <span className="text-muted">works sent in</span>
          </p>
          <p className="mt-3 text-muted">
            The apply form&rsquo;s terms and the reminder emails are the same for every show:{" "}
            <Link href="/admin/applications" className="underline">
              Apply page settings
            </Link>
            .
          </p>
        </section>
      </aside>
    </main>
  );
}
