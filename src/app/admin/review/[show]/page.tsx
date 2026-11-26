import { redirect } from "next/navigation";

/** The review board now lives on the show's own page, as its Review step. Old links keep working. */
export default async function ReviewRedirect({ params, searchParams }: { params: Promise<{ show: string }>; searchParams: Promise<Record<string, string>> }) {
  const { show } = await params;
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/admin/s/${show}/review${q ? `?${q}` : ""}`);
}
