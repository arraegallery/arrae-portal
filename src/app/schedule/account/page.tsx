import { redirect } from "next/navigation";
import { requireAssistant } from "@/lib/schedule";
import { supabaseForRequest } from "@/lib/supabase/server";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Password saved. Next time you can sign in with your email and this password." },
  short: { ok: false, text: "Use at least 10 characters." },
  mismatch: { ok: false, text: "The two passwords didn't match." },
  failed: { ok: false, text: "That password couldn't be saved. Try a different one, or sign out and back in with the email link first." },
};

async function setPassword(formData: FormData) {
  "use server";
  await requireAssistant();
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) redirect("/schedule/account?m=short");
  if (password !== String(formData.get("confirm") ?? "")) redirect("/schedule/account?m=mismatch");
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/schedule/account?m=failed");
  redirect("/schedule/account?m=saved");
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { email, assistant } = await requireAssistant();
  const msg = MESSAGES[(await searchParams).m ?? ""];
  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-8">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">My account</p>
      <h1 className="font-display text-4xl">{assistant?.name ?? email}</h1>
      <p className="mt-1 text-sm text-muted">{email}</p>
      <section className="mt-8 rounded-lg bg-white p-5 ring-1 ring-line">
        <h2 className="font-display text-2xl">Password</h2>
        <p className="mt-1 text-sm text-muted">Set a password to sign in without waiting for an email link. The email link keeps working too.</p>
        {msg && <p className={`mt-3 rounded-md p-3 text-sm ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{msg.text}</p>}
        <form action={setPassword} className="mt-4 flex flex-col gap-3">
          <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="New password (10+ characters)" className="rounded-md border border-line bg-white px-3 py-2" />
          <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder="Type it again" className="rounded-md border border-line bg-white px-3 py-2" />
          <button className="rounded-md bg-ink px-3 py-2 text-sm text-white">Save password</button>
        </form>
      </section>
    </main>
  );
}
