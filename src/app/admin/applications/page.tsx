import { desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { emailConfigured } from "@/lib/email";
import { nudgeContent } from "@/lib/apply-nudge";
import { requireOwner } from "@/lib/team";
import { getShows } from "@/lib/queries";
import { getTerms } from "@/lib/terms";
import { portalUrl } from "@/lib/notify";
import { ApplicationSettings } from "./ApplicationSettings";

export default async function ApplicationsPage() {
  await requireOwner();
  const [shows, terms, signups] = await Promise.all([getShows(), getTerms(), db.select().from(s.applicantSignups).orderBy(desc(s.applicantSignups.createdAt)).limit(200)]);
  return (
    <ApplicationSettings
      applyUrl={portalUrl("/apply")}
      terms={terms.text}
      custom={terms.custom}
      signups={signups.map((x) => ({ email: x.email, started: x.createdAt.toISOString(), agreed: !!x.termsAgreedAt, submitted: x.submittedAt?.toISOString() ?? null, artistId: x.artistId, showId: x.showId, nudged: x.nudgedAt?.toISOString() ?? null, nudges: x.nudgeCount }))}
      nudge={await nudgeContent()}
      emailOn={emailConfigured()}
      showNames={Object.fromEntries(shows.map((x) => [x.id, x.name]))}
    />
  );
}
