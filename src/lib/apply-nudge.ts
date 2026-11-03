import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "./notify";

/** The open show with the nearest application deadline that hasn't passed, if any. */
async function nextDeadline() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [show] = await db
    .select({ name: s.shows.name, deadline: s.shows.applicationDeadline })
    .from(s.shows)
    .where(and(eq(s.shows.openForSubmissions, true), isNotNull(s.shows.applicationDeadline), gte(s.shows.applicationDeadline, today)))
    .orderBy(asc(s.shows.applicationDeadline))
    .limit(1);
  return show?.deadline ? { name: show.name, day: new Date(`${show.deadline}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }) } : null;
}

/** The reminder sent to people who started an application but haven't sent it. */
export async function nudgeContent() {
  const d = await nextDeadline();
  return {
    subject: d ? `Finish your ARRAE application before ${d.day}` : "Finish your ARRAE application",
    heading: "Your application is almost there",
    body: `Hi,\n\nYou started an application to show with ARRAE but haven't sent it yet.${d ? ` Applications for ${d.name} close ${d.day}.` : ""}\n\nIt only takes a few minutes. Open the application page, enter the same email address, and we'll send you a link to pick up where you left off. It's free to apply.\n\nQuestions? Just reply to this email.`,
    buttonLabel: "Finish my application",
    buttonUrl: portalUrl("/apply"),
  };
}
