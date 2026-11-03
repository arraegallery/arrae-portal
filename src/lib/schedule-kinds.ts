/** Shift types and colors. Safe to import from client components (no database). */
export const SHIFT_KINDS = [
  { id: "standard", label: "Gallery hours", chip: "bg-white ring-line" },
  { id: "opening", label: "Show Opening", chip: "bg-rose-50 ring-rose-300" },
  { id: "special", label: "Special Event", chip: "bg-violet-50 ring-violet-300" },
  { id: "install", label: "Install / deinstall", chip: "bg-yellow-50 ring-yellow-300" },
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
