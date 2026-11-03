import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { adminEmails } from "./auth";
import { supabaseConfigured, supabaseForRequest } from "./supabase/server";
import { SHIFT_KINDS, type ShiftKind } from "./schedule-kinds";

export { SHIFT_KINDS, type ShiftKind };

/** The gallery's own clock. Every shift date and time is wall time here. */
export const GALLERY_TZ = "America/New_York";

/** Standard gallery hours by weekday (0 = Sunday): Wed–Fri 12:30–6, Sat 10:30–6. */
export const STANDARD_HOURS: Record<number, { start: string; end: string }> = {
  3: { start: "12:30", end: "18:00" },
  4: { start: "12:30", end: "18:00" },
  5: { start: "12:30", end: "18:00" },
  6: { start: "10:30", end: "18:00" },
};

/** Swap requests close this many hours before a shift starts, unless changed in Schedule settings. */
export const DEFAULT_SWAP_CUTOFF_HOURS = 48;

export const COLORS = ["violet", "sky", "amber", "emerald", "rose", "teal", "orange", "indigo", "lime", "fuchsia"] as const;

const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

/** Today's date and the time now, on the gallery's clock. */
export function galleryNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: GALLERY_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, stamp: `${date}T${time}` };
}

/** The real moment a gallery wall-clock time happens (handles daylight saving). */
export function galleryInstant(date: string, time: string) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const shown = galleryNow(new Date(guess));
  const offset = Date.parse(`${shown.stamp}:00Z`) - guess;
  return new Date(guess - offset);
}

export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const shiftMinutes = (start: string, end: string) => Math.max(0, minutesOf(end) - minutesOf(start));
export const hoursLabel = (minutes: number) => {
  const h = Math.round((minutes / 60) * 100) / 100;
  return `${h} ${h === 1 ? "hr" : "hrs"}`;
};

export function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
export const timeRange = (start: string, end: string) => `${clock(start)}–${clock(end)}`;
export const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
export const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const monthEnd = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return addDays(d.toISOString().slice(0, 10), -1);
};
export const nextMonth = (m: string) => addDays(monthEnd(m), 1).slice(0, 7);

export const kindLabel = (k: string) => SHIFT_KINDS.find((x) => x.id === k)?.label ?? "Shift";

/** Shifts can be swapped until this cutoff before they start. */
export async function swapCutoffHours() {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "schedule_swap_cutoff_hours"));
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SWAP_CUTOFF_HOURS;
}

export function canStillSwap(shift: { date: string; startTime: string }, cutoffHours: number, now = new Date()) {
  return galleryInstant(shift.date, shift.startTime).getTime() - now.getTime() >= cutoffHours * 3600 * 1000;
}

export async function assistantFor(email: string | null | undefined) {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  const [a] = await db
    .select()
    .from(s.assistants)
    .where(and(eq(s.assistants.email, e), isNull(s.assistants.removedAt)));
  return a ?? null;
}

/**
 * The signed-in Gallery Assistant. Owners may open the assistant pages too (to see what
 * the team sees); they get a stand-in record when they are not on the roster themselves.
 */
export async function requireAssistant() {
  let email: string | undefined;
  if (devBypass()) email = process.env.DEV_ASSISTANT_EMAIL || "dev@localhost";
  else {
    if (!supabaseConfigured) redirect("/login?error=setup");
    const supabase = await supabaseForRequest();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email?.toLowerCase();
  }
  if (!email) redirect("/login");
  const me = await assistantFor(email);
  const owner = devBypass() || adminEmails().includes(email);
  if (!me && !owner) redirect("/login?error=not-assistant");
  return { email, assistant: me, owner };
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
