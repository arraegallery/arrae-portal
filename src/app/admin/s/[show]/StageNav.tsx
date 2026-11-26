"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { STAGES, type ShowFacts, type StageKey, stageCount } from "@/lib/stages";

/** The show's six steps as tabs. The step the show is on now gets a dot. */
export function StageTabs({ showId, current, facts }: { showId: string; current: StageKey; facts: ShowFacts }) {
  const path = usePathname();
  const active = STAGES.find((st) => path.startsWith(`/admin/s/${showId}/${st.key}`))?.key ?? current;
  const nowIndex = STAGES.findIndex((st) => st.key === current);
  const onRef = useRef<HTMLAnchorElement>(null);
  // On a phone the tabs scroll sideways: keep the open step in view.
  useEffect(() => onRef.current?.scrollIntoView({ block: "nearest", inline: "center" }), [active]);
  return (
    <nav aria-label="Show steps" className="-mx-4 mt-5 overflow-x-auto px-4">
      <ol className="flex min-w-max border-b border-line">
        {STAGES.map((st, i) => {
          const on = st.key === active;
          const done = i < nowIndex;
          const n = stageCount(st.key, facts);
          return (
            <li key={st.key}>
              <Link
                href={`/admin/s/${showId}/${st.key}`}
                ref={on ? onRef : undefined}
                title={st.hint}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex flex-col border-b-2 px-4 pb-2.5 pt-1 transition ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                      st.key === current ? "bg-ink text-white" : done ? "bg-emerald-600 text-white" : "bg-white text-muted ring-1 ring-line"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={on ? "font-medium" : ""}>{st.label}</span>
                  {st.key === current && <span className="rounded-full bg-ink/10 px-1.5 text-[10px] uppercase tracking-wider text-ink">now</span>}
                </span>
                <span className="pl-7 text-xs text-muted">{n ?? " "}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <StageGuide showId={showId} active={active} current={current} />
    </nav>
  );
}

/** One plain line under the tabs: what this step is for, and where to go next. */
function StageGuide({ showId, active, current }: { showId: string; active: StageKey; current: StageKey }) {
  const i = STAGES.findIndex((st) => st.key === active);
  const st = STAGES[i];
  const next = STAGES[i + 1];
  const now = STAGES.find((x) => x.key === current)!;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm text-muted">
      <span>
        <b className="font-medium text-ink">Step {i + 1}:</b> {st.hint}.
      </span>
      {active === "review" && (
        <Link href={`/admin/review/${showId}/new`} className="underline hover:text-ink">
          First-time applicants, one at a time
        </Link>
      )}
      {active !== current && (
        <Link href={`/admin/s/${showId}/${current}`} className="underline hover:text-ink">
          This show is on step {STAGES.indexOf(now) + 1}, {now.label} →
        </Link>
      )}
      {active === current && next && (
        <Link href={`/admin/s/${showId}/${next.key}`} className="ml-auto rounded-md bg-white px-3 py-1 text-ink ring-1 ring-line hover:bg-paper">
          Next step: {next.label} →
        </Link>
      )}
    </p>
  );
}

/** Switch to another show, staying on the same step. */
export function ShowSwitcher({ current, shows }: { current: string; shows: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const step = path.split("/")[4] ?? "";
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/admin/s/${e.target.value}${step ? `/${step}` : ""}`)}
      aria-label="Choose a show"
      className="max-w-72 rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line"
    >
      {shows.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
}
