/** Signed once per artist. */
export const ARTIST_ONBOARDING = [["agreement", "Agreement signed"]] as const;

/** Tracked separately for every show an artist is in. */
export const SHOW_ONBOARDING = [
  ["w9", "W-9 received"],
  ["dropoffScheduled", "Drop-off scheduled"],
  ["worksReceived", "Works received"],
  ["meetGreet", "Meet & greet"],
  ["coaRequested", "COA requested"],
] as const;

export type Onboarding = { agreement?: boolean; shows?: Record<string, Record<string, boolean>> } & Record<string, unknown>;

export function readOnboarding(raw: unknown): Onboarding {
  return raw && typeof raw === "object" ? (raw as Onboarding) : {};
}
