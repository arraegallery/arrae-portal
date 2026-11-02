"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendAgreement, voidAgreement } from "./actions";

export type AgreementSummary = { id: string; sentAt: string; signedAt: string | null; signedAs: string | null } | null;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

/** On an artist's page: send the Partnership Agreement, see if it's signed, open the signed PDF. */
export function AgreementPanel({ artistId, artistName, hasEmail, agreement }: { artistId: string; artistName: string; hasEmail: boolean; agreement: AgreementSummary }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      setError(null);
      try {
        setNote(await fn());
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const send = () => {
    if (!confirm(`Send the Partnership Agreement to ${artistName}? They'll get a message in their studio${hasEmail ? " and an email" : ""}.`)) return;
    run(async () => ((await sendAgreement(artistId)).emailed ? "Sent. They have a message and an email with the link." : "Sent. It's waiting in their studio and message thread."));
  };
  return (
    <div className="mt-2 rounded-md bg-paper p-2 text-xs ring-1 ring-line">
      <p className="font-medium">Partnership Agreement</p>
      {!agreement && <p className="text-muted">Not sent yet.</p>}
      {agreement && !agreement.signedAt && <p className="text-amber-800">Sent {day(agreement.sentAt)}, waiting for their signature.</p>}
      {agreement?.signedAt && (
        <p className="text-emerald-800">
          Signed {day(agreement.signedAt)} as &ldquo;{agreement.signedAs}&rdquo;.{" "}
          <a href={`/api/agreements/${agreement.id}`} target="_blank" rel="noreferrer" className="underline">
            Open signed PDF
          </a>
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {!agreement?.signedAt && (
          <button onClick={send} disabled={pending} className="rounded bg-ink px-2 py-1 text-white disabled:opacity-50">
            {agreement ? "Send again" : "Send to sign"}
          </button>
        )}
        {agreement && !agreement.signedAt && (
          <button onClick={() => confirm("Cancel this unsigned agreement?") && run(async () => (await voidAgreement(agreement.id), "Cancelled."))} disabled={pending} className="rounded px-2 py-1 ring-1 ring-line">
            Cancel it
          </button>
        )}
      </div>
      {note && <p className="mt-1 text-emerald-800">{note}</p>}
      {error && <p className="mt-1 text-rose-700">{error}</p>}
    </div>
  );
}
