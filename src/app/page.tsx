import { redirect } from "next/navigation";
import { staffHomeFor } from "@/lib/team";
import { signedInEmail } from "@/lib/artist-auth";

export default async function Home() {
  const email = await signedInEmail();
  if (!email) redirect("/login");
  redirect((await staffHomeFor(email)) ?? "/studio");
}
