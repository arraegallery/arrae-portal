"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { ESIGN_CONSENT } from "@/lib/agreement-text";
import { signAgreement } from "./actions";

export function SignForm({ id, defaultName, email }: { id: string; defaultName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = name.trim().length > 1 && !!signature && consent;
  const sign = () =>
    start(async () => {
      setError(null);
      try {
        await signAgreement({ id, name, signature: signature!, consent });
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <section className="mt-6 rounded-lg bg-white p-6 ring-1 ring-line sm:p-8">
      <h2 className="font-display text-2xl">Sign the agreement</h2>
      <p className="mt-1 text-sm text-muted">You&rsquo;re signed in as {email}. We&rsquo;ll keep a record of when and where you signed.</p>
      <label className="mt-4 block text-sm">
        Your full legal name
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md bg-white px-3 py-2 ring-1 ring-line" autoComplete="name" />
      </label>
      <div className="mt-4 text-sm">
        <p className="mb-1">Your signature</p>
        <SignaturePad onChange={setSignature} />
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>{ESIGN_CONSENT}</span>
      </label>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <button onClick={sign} disabled={!ready || pending} className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-white disabled:opacity-40 sm:w-auto">
        {pending ? "Signing…" : "Sign agreement"}
      </button>
    </section>
  );
}
