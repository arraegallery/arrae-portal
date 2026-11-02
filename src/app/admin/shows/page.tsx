import { desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { getShowsAdmin } from "@/lib/queries";
import { getTerms } from "@/lib/terms";
import { portalUrl } from "@/lib/notify";
import { ShowsManager } from "./ShowsManager";
import { ApplicationSettings } from "./ApplicationSettings";

export default async function ShowsPage() {
  await requireOwner();
  const [shows, terms, signups] = await Promise.all([getShowsAdmin(), getTerms(), db.select().from(s.applicantSignups).orderBy(desc(s.applicantSignups.createdAt)).limit(200)]);
  return (
    <>
      <ShowsManager shows={shows} />
      <ApplicationSettings
        applyUrl={portalUrl("/apply")}
        terms={terms.text}
        custom={terms.custom}
        signups={signups.map((x) => ({ email: x.email, started: x.createdAt.toISOString(), agreed: !!x.termsAgreedAt, submitted: x.submittedAt?.toISOString() ?? null, artistId: x.artistId, showId: x.showId }))}
        showNames={Object.fromEntries(shows.map((x) => [x.id, x.name]))}
      />
    </>
  );
}
