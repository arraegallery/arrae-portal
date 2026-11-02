/** Kinds of gallery calendar entries, with the chip colors the calendar uses. */
export const EVENT_KINDS = [
  { id: "event", label: "Event", chip: "bg-violet-100 text-violet-900 ring-violet-200", dot: "bg-violet-500" },
  { id: "opening", label: "Opening / reception", chip: "bg-rose-100 text-rose-900 ring-rose-200", dot: "bg-rose-500" },
  { id: "install", label: "Install / deinstall", chip: "bg-yellow-100 text-yellow-900 ring-yellow-300", dot: "bg-yellow-400" },
  { id: "private", label: "Private event / rental", chip: "bg-blue-100 text-blue-900 ring-blue-200", dot: "bg-blue-500" },
  { id: "closed", label: "Gallery closed", chip: "bg-stone-200 text-stone-800 ring-stone-300", dot: "bg-stone-500" },
  { id: "other", label: "Other", chip: "bg-slate-100 text-slate-800 ring-slate-200", dot: "bg-slate-400" },
] as const;

export const SHOW_CHIP = "bg-emerald-100 text-emerald-900 ring-emerald-200";
export const SHOW_DOT = "bg-emerald-500";
export const DEADLINE_CHIP = "bg-white text-rose-800 ring-rose-300";
export const DEADLINE_DOT = "bg-rose-300";
export const WINDOW_CHIP = "bg-cyan-50 text-cyan-900 ring-cyan-200";
export const WINDOW_DOT = "bg-cyan-500";
