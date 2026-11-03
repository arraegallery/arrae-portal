/** Shift types and colors. Safe to import from client components (no database). */
export const SHIFT_KINDS = [
  { id: "standard", label: "Gallery hours", chip: "bg-white ring-line" },
  { id: "opening", label: "Show Opening", chip: "bg-rose-50 ring-rose-300" },
  { id: "special", label: "Special Event", chip: "bg-violet-50 ring-violet-300" },
  { id: "setup", label: "Set up", chip: "bg-yellow-50 ring-yellow-300" },
  { id: "breakdown", label: "Break down", chip: "bg-orange-50 ring-orange-300" },
  { id: "install", label: "Drop-off / install", chip: "bg-yellow-50 ring-yellow-300" },
  { id: "other", label: "Other", chip: "bg-slate-50 ring-slate-300" },
] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number]["id"];

/** Each assistant's color. Class names are written out in full so Tailwind keeps them. */
export const PERSON_COLORS: Record<string, { dot: string; chip: string; label: string }> = {
  violet: { dot: "bg-violet-500", chip: "bg-violet-100 text-violet-950 ring-violet-300", label: "Violet" },
  sky: { dot: "bg-sky-500", chip: "bg-sky-100 text-sky-950 ring-sky-300", label: "Sky" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-100 text-amber-950 ring-amber-300", label: "Amber" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-950 ring-emerald-300", label: "Green" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-100 text-rose-950 ring-rose-300", label: "Rose" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-100 text-teal-950 ring-teal-300", label: "Teal" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-100 text-orange-950 ring-orange-300", label: "Orange" },
  indigo: { dot: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-950 ring-indigo-300", label: "Indigo" },
  lime: { dot: "bg-lime-500", chip: "bg-lime-100 text-lime-950 ring-lime-300", label: "Lime" },
  fuchsia: { dot: "bg-fuchsia-500", chip: "bg-fuchsia-100 text-fuchsia-950 ring-fuchsia-300", label: "Fuchsia" },
};
export const OPEN_CHIP = "bg-white text-ink ring-0 border border-dashed border-ink/50";
export const personColor = (c: string | null | undefined) => PERSON_COLORS[c ?? ""] ?? PERSON_COLORS.violet;

/** Show the gallery's events (openings, closures…) as context on the schedule. */
export const EVENT_CHIP = "bg-stone-100 text-stone-700 ring-stone-200";

/** Shift types that go on the gallery calendar as events, and the calendar event type they become. */
export const EVENT_KIND_FOR_SHIFT: Record<string, string> = { opening: "opening", special: "event", setup: "install", breakdown: "install", install: "install" };

/** What the team calls someone: their preferred name, else their first name. */
export const callName = (p: { name: string; preferredName?: string | null }) => p.preferredName?.trim() || p.name.trim().split(/\s+/)[0] || p.name;

/** "12:30pm–6pm", or "Hours TBD (up to 6 hrs)" for a shift whose hours aren't fixed yet. */
export function shiftTime(sh: { startTime: string; endTime: string; timeTbd?: boolean | null; maxHours?: number | null }) {
  if (sh.timeTbd) return `Hours TBD${sh.maxHours ? ` (up to ${sh.maxHours} hrs)` : ""}`;
  const c = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  };
  return `${c(sh.startTime)}–${c(sh.endTime)}`;
}

/** When a shift is over, as "YYYY-MM-DDTHH:MM" gallery time. A shift with hours still TBD counts as over at the end of its day. */
export const shiftEnds = (sh: { date: string; endTime: string; timeTbd: boolean }) => `${sh.date}T${sh.timeTbd ? "23:59" : sh.endTime}`;

export const kindLabelOf = (k: string) => SHIFT_KINDS.find((x) => x.id === k)?.label ?? "Shift";
