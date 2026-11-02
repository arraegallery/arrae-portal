"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Prose } from "@/components/Prose";
import { SignaturePad } from "@/components/SignaturePad";
import { saveAgreementTemplate, saveGallerySigner } from "./actions";

type Signer = { name: string; title: string; signature: string | null };

export function AgreementSettings({ template, custom, signer }: { template: string; custom: boolean; signer: Signer }) {
  const router = useRouter();
  const [name, setName] = useState(signer.name);
  const [title, setTitle] = useState(signer.title);
  const [signature, setSignature] = useState<string | null>(signer.signature);
  const [redraw, setRedraw] = useState(!signer.signature);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState(template);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      setMsg(null);
      try {
        await fn();
        setMsg({ ok: true, text: ok });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <>
      <section className="rounded-lg bg-white p-4 ring-1 ring-line">
        <h2 className="text-xs uppercase tracking-wider text-muted">Signing for ARRAE</h2>
        <p className="mt-1 text-sm text-muted">Draw your signature once. It goes on every agreement you send from now on. Agreements already sent keep the signature they went out with.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
          </label>
          <label className="text-sm">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md bg-white px-2 py-1.5 ring-1 ring-line" />
          </label>
        </div>
        <div className="mt-3 max-w-md text-sm">
          {redraw ? (
            <SignaturePad onChange={setSignature} />
          ) : (
            <div className="flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {signature && <img src={signature} alt="Your saved signature" className="h-16 w-auto rounded bg-white ring-1 ring-line" />}
              <button onClick={() => (setSignature(null), setRedraw(true))} className="text-xs text-muted underline">
                Draw it again
              </button>
            </div>
          )}
          {!signature && <p className="mt-1 text-xs text-muted">Without a drawn signature, your typed name is used.</p>}
        </div>
        <button
          disabled={pending}
          onClick={() => run(async () => (await saveGallerySigner({ name, title, signature }), setRedraw(!signature)), "Saved.")}
          className="mt-3 rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save signer
        </button>
      </section>

      <section className="rounded-lg bg-white p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Agreement wording</h2>
          <span className="text-xs text-muted">{custom ? "Edited here" : "From your January 2026 agreement"}</span>
          {!editing && (
            <button onClick={() => (setDraft(template), setEditing(true))} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
              Edit wording
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-3">
            <p className="text-xs text-muted">
              <code>{"{{artist}}"}</code> is replaced with the artist&rsquo;s name. Blank line = new paragraph, <code>## </code> = heading. Changes apply to agreements you send next, not to
              ones already sent or signed.
            </p>
            <div className="mt-2 flex gap-2 text-xs">
              <button onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ring-1 ${!preview ? "bg-ink text-white ring-ink" : "ring-line"}`}>
                Write
              </button>
              <button onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ring-1 ${preview ? "bg-ink text-white ring-ink" : "ring-line"}`}>
                Preview
              </button>
            </div>
            {preview ? (
              <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-md bg-paper p-4 ring-1 ring-line">
                <Prose text={draft.replaceAll("{{artist}}", "Artist Name")} />
              </div>
            ) : (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 h-[60vh] w-full rounded-md bg-white p-3 font-mono text-xs ring-1 ring-line" />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {custom && (
                <button onClick={() => confirm("Go back to the January 2026 wording?") && run(async () => (await saveAgreementTemplate(null), setEditing(false)), "Back to the original wording.")} className="rounded-md px-3 py-1 text-xs text-muted ring-1 ring-line">
                  Use the original
                </button>
              )}
              <button onClick={() => setEditing(false)} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
                Cancel
              </button>
              <button disabled={pending} onClick={() => run(async () => (await saveAgreementTemplate(draft), setEditing(false)), "Wording saved.")} className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-50">
                Save wording
              </button>
            </div>
          </div>
        ) : (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-muted">Show the agreement</summary>
            <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-md bg-paper p-4 ring-1 ring-line">
              <Prose text={template.replaceAll("{{artist}}", "Artist Name")} />
            </div>
          </details>
        )}
      </section>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-800" : "text-rose-700"}`}>{msg.text}</p>}
    </>
  );
}
