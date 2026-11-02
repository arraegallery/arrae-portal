/**
 * Status vocabulary. Admins see the working label; artists only ever see the soft label.
 * Shortlist is private and reads as "Under review" to artists.
 */
export const APPLICATION_STATUSES = [
  "New",
  "In review",
  "Shortlist",
  "Waitlist",
  "Selected",
  "Request other works",
  "Not selected",
  "Withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const WORK_STATUSES = [
  "Submitted",
  "In review",
  "Shortlist",
  "Requested",
  "Selected",
  "Waitlist",
  "Not included",
  "Unavailable",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export function artistFacingApplication(status: ApplicationStatus, showName?: string): string {
  switch (status) {
    case "New":
      return "Application received";
    case "In review":
    case "Shortlist":
      return "Under review";
    case "Waitlist":
      return "On our waitlist for a future opening";
    case "Selected":
      return showName ? `Selected for ${showName}` : "Selected";
    case "Request other works":
      return "We'd love to see more of your work";
    case "Not selected":
      return showName
        ? `Not selected for ${showName}, we hope you'll apply again`
        : "Not selected this time, we hope you'll apply again";
    case "Withdrawn":
      return "Withdrawn";
  }
}

export function artistFacingWork(status: WorkStatus, showName?: string): string {
  switch (status) {
    case "Submitted":
      return "Received";
    case "In review":
    case "Shortlist":
      return "Under review";
    case "Requested":
      return showName ? `Requested for ${showName}` : "Requested";
    case "Selected":
      return "Selected";
    case "Waitlist":
      return "On our waitlist";
    case "Not included":
      return "Not included this round";
    case "Unavailable":
      return "No longer available";
  }
}

/** Colour token per admin status, used for chips. */
export const STATUS_TONE: Record<string, string> = {
  New: "bg-stone-100 text-stone-700 ring-stone-300",
  Submitted: "bg-stone-100 text-stone-700 ring-stone-300",
  "In review": "bg-sky-50 text-sky-800 ring-sky-200",
  Shortlist: "bg-violet-50 text-violet-800 ring-violet-200",
  Requested: "bg-violet-50 text-violet-800 ring-violet-200",
  Waitlist: "bg-amber-50 text-amber-800 ring-amber-200",
  Selected: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Request other works": "bg-teal-50 text-teal-800 ring-teal-200",
  "Not selected": "bg-rose-50 text-rose-800 ring-rose-200",
  "Not included": "bg-rose-50 text-rose-800 ring-rose-200",
  Withdrawn: "bg-stone-100 text-stone-500 ring-stone-200",
  Unavailable: "bg-stone-100 text-stone-500 ring-stone-200",
};
