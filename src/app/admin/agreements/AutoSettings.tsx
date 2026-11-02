"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AutoMode } from "@/lib/agreement";
import { remindAgreements, saveAgreementAuto } from "./actions";

export function AutoSettings({ mode: initialMode, reminders: initialReminders, cronReady, schedule }: { mode: AutoMode; reminders: boolean; cronReady: boolean; schedule: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [reminders, setReminders] = useState(initialReminders);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: { mode: AutoMode; reminders: boolean }) =>
    start(async () => {
      setMode(next.mode);
      setReminders(next.reminders);
      await saveAgreementAuto(next);
      setMsg("Saved.");
      router.refresh();
    });
  const options: [AutoMode, string, string][] = [
    ["unsigned", "Selected artists who haven't signed", "Anyone selected for a show whose “Agreement signed” step isn't ticked."],
    ["all", "Every selected artist, even if they signed before", "Also asks artists who signed an older copy (for example in Google) to sign this version."],
    ["off", "No one automatically", "Only artists you send it to from their page."],
  ];
  return (
    <section className="rounded-lg bg-white p-4 ring-1 ring-line">
      <h2 className="text-xs uppercase tracking-wider text-muted">Automatic</h2>
      <p className="mt-2 text-sm font-medium">When an artist signs in to their studio, ask them to sign:</p>
      <div className="mt-2 space-y-2">
        {options.map(([v, label, help]) => (
          <label key={v} className="flex items-start gap-2 text-sm">
            <input type="radio" name="auto" checked={mode === v} disabled={pending} onChange={() => save({ mode: v, reminders })} className="mt-1" />
            <span>
              {label}
              <span className="block text-xs text-muted">{help}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={reminders} disabled={pending} onChange={(e) => save({ mode, reminders: e.target.checked })} className="mt-1" />
        <span>
          Email reminders for unsigned agreements
          <span className="block text-xs text-muted">{schedule}</span>
        </span>
      </label>
      {reminders && !cronReady && (
        <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Automatic reminders start once the CRON_SECRET setting is added in Vercel. Until then, use the Remind buttons.
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-emerald-800">{msg}</p>}
    </section>
  );
}

export function RemindButton({ ids, label }: { ids: string[]; label: string }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!ids.length) return null;
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          confirm(ids.length === 1 ? "Email this artist a reminder to sign?" : `Email a reminder to all ${ids.length} artists who haven't signed?`) &&
          start(async () => {
            try {
              const r = await remindAgreements(ids);
              setNote(r.sent ? `Sent ${r.sent}` : "Not sent (no email on file, or email isn't set up)");
              router.refresh();
            } catch (e) {
              setNote((e as Error).message);
            }
          })
        }
        className="rounded px-1.5 py-0.5 text-xs ring-1 ring-line hover:bg-paper disabled:opacity-50"
      >
        {pending ? "Sending…" : label}
      </button>
      {note && <span className="text-xs text-muted"> {note}</span>}
    </>
  );
}
