import { redirect } from "next/navigation";
import { teamRoleFor } from "@/lib/team";
import { signedInEmail } from "@/lib/artist-auth";

export default async function Home() {
  const email = await signedInEmail();
  if (!email) redirect("/login");
  redirect((await teamRoleFor(email)) ? "/admin" : "/studio");
}
