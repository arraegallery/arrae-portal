import { notFound } from "next/navigation";
import { getShowOverview } from "@/lib/show-stage";
import { requireOwner } from "@/lib/team";
import { CallStep } from "./CallStep";

/** Step 1: the show's dates and the open call. */
export default async function CallPage({ params }: { params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show } = await params;
  const o = await getShowOverview(show);
  if (!o) notFound();
  const x = o.show;
  return (
    <CallStep
      show={{
        id: x.id,
        name: x.name,
        type: x.type,
        opensOn: x.opensOn ?? "",
        closesOn: x.closesOn ?? "",
        applicationDeadline: x.applicationDeadline ?? "",
        decisionsDueOn: x.decisionsDueOn ?? "",
        description: x.description ?? "",
        openForSubmissions: x.openForSubmissions,
      }}
      applicants={o.facts.applicants}
      works={o.facts.works}
    />
  );
}
