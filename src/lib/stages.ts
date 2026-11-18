/** The steps of a show, safe to use in the browser. Server data lives in show-stage.ts. */

/** The six steps every show goes through, in order. One page per show, one tab per step. */
export const STAGES = [
  { key: "call", label: "Call", hint: "Dates, deadline, open or close submissions" },
  { key: "review", label: "Review", hint: "Everything submitted: put works in the sandbox or pass" },
  { key: "curate", label: "Curate", hint: "The sandbox and walls, then Finalize" },
  { key: "notify", label: "Notify", hint: "Release decisions and send the welcome emails" },
  { key: "install", label: "Install", hint: "Agreements, drop-off bookings and works arriving" },
  { key: "close", label: "On view & close", hint: "Sold works, pick-up and works going home" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
export const isStage = (x: string): x is StageKey => STAGES.some((st) => st.key === x);

export type ShowFacts = {
  works: number;
  selected: number;
  sandbox: number;
  applicants: number;
  received: number;
  sold: number;
  notified: number;
  hasDropoff: boolean;
  hasPickup: boolean;
};


/** The step a show is on, worked out from what has actually happened (never set by hand). */
export function currentStage(
  show: { opensOn: string | null; closesOn: string | null; openForSubmissions: boolean; decisionsReleased: boolean },
  f: { works: number; selected: number; sandbox: number },
  today: string,
): StageKey {
  if (show.opensOn && today >= show.opensOn) return "close";
  if (f.selected > 0) return show.decisionsReleased ? "install" : "notify";
  if (show.openForSubmissions) return f.works > 0 ? "review" : "call";
  if (f.sandbox > 0) return "curate";
  if (f.works > 0) return "review";
  return "call";
}

/** A short line under a stage's tab label. */
export function stageCount(key: StageKey, f: ShowFacts) {
  switch (key) {
    case "call":
      return null;
    case "review":
      return f.works ? `${f.works} works` : null;
    case "curate":
      return f.sandbox ? `${f.sandbox} in sandbox` : null;
    case "notify":
      return f.notified ? `${f.notified} emailed` : null;
    case "install":
      return f.selected ? `${f.received} of ${f.selected} in` : null;
    case "close":
      return f.sold ? `${f.sold} sold` : null;
  }
}
