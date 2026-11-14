"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardEntry, BoardWork } from "@/lib/queries";
import type { ApplicationStatus, WorkStatus } from "@/lib/status";

/**
 * Tick-box filters for the review board. Within a box, ticks add up ("this OR that").
 * Across the "Who" column, roster artists and new applicants are two separate groups that also add up,
 * so "new works by roster artists + accepted new applicants" is one view.
 * The other columns (work decision, media) then narrow whatever the groups let through.
 */

export const ROSTER_KINDS = [
  { key: "new", label: "New works", hint: "Never listed on Shopify or selected for a show" },
  { key: "past", label: "Works shown before", hint: "On Shopify, or selected for an earlier show" },
] as const;
export type RosterKind = (typeof ROSTER_KINDS)[number]["key"];

export const APP_KINDS = [
  { key: "review", label: "To review", statuses: ["New", "In review"] },
  { key: "accept", label: "Selected (Accept)", statuses: ["Selected"] },
  { key: "maybe", label: "Shortlist (Maybe)", statuses: ["Shortlist"] },
  { key: "more", label: "Asked for other works", statuses: ["Request other works"] },
  { key: "waitlist", label: "Waitlist", statuses: ["Waitlist"] },
  { key: "decline", label: "Not selected (Decline)", statuses: ["Not selected"] },
  { key: "withdrawn", label: "Withdrawn", statuses: ["Withdrawn"] },
  { key: "none", label: "No application", statuses: [] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ApplicationStatus[] }[];
export type AppKind = (typeof APP_KINDS)[number]["key"];

export const WORK_KINDS = [
  { key: "todo", label: "Still to decide", statuses: ["Submitted", "In review", "Requested"] },
  { key: "shortlist", label: "Shortlist", statuses: ["Shortlist"] },
  { key: "selected", label: "Selected", statuses: ["Selected"] },
  { key: "waitlist", label: "Waitlist", statuses: ["Waitlist"] },
  { key: "no", label: "No (not included)", statuses: ["Not included"] },
  { key: "unavailable", label: "Unavailable", statuses: ["Unavailable"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly WorkStatus[] }[];
export type WorkKind = (typeof WORK_KINDS)[number]["key"];

export type Filters = {
  roster: RosterKind[];
  applicants: AppKind[];
  work: WorkKind[];
  /** Media that are switched OFF, so a new medium shows up by default. */
  hiddenMedia: string[];
};

export const EVERYTHING: Filters = {
  roster: ROSTER_KINDS.map((k) => k.key),
  applicants: APP_KINDS.map((k) => k.key),
  work: WORK_KINDS.map((k) => k.key),
  hiddenMedia: [],
};

/** New works from roster artists, plus new applicants marked Selected (Accept). Works marked No are left out. */
export const FINAL_CURATION: Filters = {
  roster: ["new"],
  applicants: ["accept"],
  work: ["todo", "shortlist", "selected", "waitlist"],
  hiddenMedia: [],
};

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
export function isPreset(f: Filters, p: Filters) {
  return same(f.roster, p.roster) && same(f.applicants, p.applicants) && same(f.work, p.work) && same(f.hiddenMedia, p.hiddenMedia);
}

export function appKind(e: BoardEntry): AppKind {
  if (!e.application) return "none";
  return APP_KINDS.find((k) => (k.statuses as readonly string[]).includes(e.application!.status))?.key ?? "review";
}
export function workKind(w: BoardWork): WorkKind {
  return WORK_KINDS.find((k) => (k.statuses as readonly string[]).includes(w.status))?.key ?? "todo";
}

/** Does this work pass the tick boxes (not the price or search box)? */
export function passes(f: Filters, e: BoardEntry, w: BoardWork) {
  const who = e.group === "Roster artist" ? f.roster.includes(w.shownBefore ? "past" : "new") : f.applicants.includes(appKind(e));
  return who && f.work.includes(workKind(w)) && !f.hiddenMedia.includes(w.category ?? "Other");
}

export function useSavedFilters(showId: string) {
  const key = `review-filters:${showId}`;
  const [filters, setFilters] = useState<Filters>(EVERYTHING);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Filters>;
        setFilters({
          roster: Array.isArray(v.roster) ? v.roster : EVERYTHING.roster,
          applicants: Array.isArray(v.applicants) ? v.applicants : EVERYTHING.applicants,
          work: Array.isArray(v.work) ? v.work : EVERYTHING.work,
          hiddenMedia: Array.isArray(v.hiddenMedia) ? v.hiddenMedia : [],
        });
      }
    } catch {}
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(filters));
    } catch {}
  }, [key, filters]);
  return [filters, setFilters] as const;
}

function toggle<T extends string>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Box({ checked, onChange, label, count, hint, strong }: { checked: boolean; onChange: () => void; label: string; count?: number; hint?: string; strong?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5" title={hint}>
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-ink" />
      <span className={strong ? "font-medium" : ""}>
        {label}
        {count !== undefined && <span className="ml-1 text-muted">{count}</span>}
      </span>
    </label>
  );
}

function GroupBox({ label, all, some, onChange }: { label: string; all: boolean; some: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [all, some]);
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 font-medium">
      <input ref={ref} type="checkbox" checked={all} onChange={onChange} className="h-4 w-4 accent-ink" />
      {label}
    </label>
  );
}

export function FilterPanel({ filters, setFilters, entries, categories }: { filters: Filters; setFilters: (f: Filters) => void; entries: BoardEntry[]; categories: string[] }) {
  const roster = entries.filter((e) => e.group === "Roster artist");
  const newcomers = entries.filter((e) => e.group === "New applicant");
  const all = entries.flatMap((e) => e.works);
  const rosterCount = (k: RosterKind) => roster.flatMap((e) => e.works).filter((w) => (w.shownBefore ? "past" : "new") === k).length;
  const appCount = (k: AppKind) => newcomers.filter((e) => appKind(e) === k).flatMap((e) => e.works).length;
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  const rosterAll = filters.roster.length === ROSTER_KINDS.length;
  const appsAll = filters.applicants.length === APP_KINDS.length;
  const media = categories.length ? categories : [];

  return (
    <div className="mt-2 grid w-full gap-6 rounded-lg bg-white p-4 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.15em] text-muted">Roster artists</p>
        <GroupBox label="All roster artists" all={rosterAll} some={filters.roster.length > 0} onChange={() => set({ roster: rosterAll ? [] : ROSTER_KINDS.map((k) => k.key) })} />
        <div className="ml-6">
          {ROSTER_KINDS.map((k) => (
            <Box key={k.key} checked={filters.roster.includes(k.key)} onChange={() => set({ roster: toggle(filters.roster, k.key) })} label={k.label} hint={k.hint} count={rosterCount(k.key)} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.15em] text-muted">New applicants (by application)</p>
        <GroupBox label="All new applicants" all={appsAll} some={filters.applicants.length > 0} onChange={() => set({ applicants: appsAll ? [] : APP_KINDS.map((k) => k.key) })} />
        <div className="ml-6">
          {APP_KINDS.filter((k) => k.key !== "none" || appCount("none") > 0).map((k) => (
            <Box key={k.key} checked={filters.applicants.includes(k.key)} onChange={() => set({ applicants: toggle(filters.applicants, k.key) })} label={k.label} count={appCount(k.key)} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.15em] text-muted">Work decision</p>
        {WORK_KINDS.map((k) => (
          <Box key={k.key} checked={filters.work.includes(k.key)} onChange={() => set({ work: toggle(filters.work, k.key) })} label={k.label} count={all.filter((w) => workKind(w) === k.key).length} />
        ))}
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.15em] text-muted">Media</p>
        {media.map((c) => (
          <Box key={c} checked={!filters.hiddenMedia.includes(c)} onChange={() => set({ hiddenMedia: toggle(filters.hiddenMedia, c) })} label={c} count={all.filter((w) => (w.category ?? "Other") === c).length} />
        ))}
        {media.length > 1 && (
          <div className="mt-1 flex gap-3 text-xs">
            <button onClick={() => set({ hiddenMedia: [] })} className="underline">
              All
            </button>
            <button onClick={() => set({ hiddenMedia: media })} className="underline">
              None
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
