import { redirect } from "next/navigation";

/** Notify artists now lives on the show's own page, as its Notify step. Old links keep working. */
export default async function NotifyRedirect({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  redirect(`/admin/s/${show}/notify`);
}
