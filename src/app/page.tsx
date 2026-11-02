import { redirect } from "next/navigation";
import { adminEmails } from "@/lib/auth";
import { signedInEmail } from "@/lib/artist-auth";

export default async function Home() {
  const email = await signedInEmail();
  if (!email) redirect("/login");
  redirect(adminEmails().includes(email) ? "/admin" : "/studio");
}
