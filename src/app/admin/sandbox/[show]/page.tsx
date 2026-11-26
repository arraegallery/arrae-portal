import { redirect } from "next/navigation";

/** The sandbox now lives on the show's own page, as its Curate step. Old links keep working. */
export default async function SandboxRedirect({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  redirect(`/admin/s/${show}/curate`);
}
