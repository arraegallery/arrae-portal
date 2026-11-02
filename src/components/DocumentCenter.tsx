"use client";

import { useState, useTransition } from "react";
import { ARTIST_UPLOAD_KINDS, DOC_KINDS, kindLabel, MAX_DOC_BYTES, uploadDocumentFile, type DocRow } from "@/lib/document-kinds";

type AddInput = { path: string; fileName: string; contentType: string | null; sizeBytes: number | null; kind: string; title: string; note: string; showId: string | null; visibleToArtist: boolean; tell: boolean };

export type DocActions = {
  prepare: (fileName: string, size: number) => Promise<{ path: string; token: string }>;
  add: (input: AddInput) => Promise<DocRow[]>;
  remove: (id: string) => Promise<DocRow[]>;
  setVisible?: (id: string, visible: boolean) => Promise<DocRow[]>;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const size = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** The document list and upload form, for ARRAE on an artist's page and for the artist in their studio. */
export function DocumentCenter({ mode, initial, actions, shows = [], artistName }: { mode: "arrae" | "artist"; initial: DocRow[]; actions: DocActions; shows?: { id: string; name: string }[]; artistName?: string }) {
  const arrae = mode === "arrae";
  const [docs, setDocs] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const kinds = arrae ? DOC_KINDS.map(([k]) => k) : ARTIST_UPLOAD_KINDS;
  const [kind, setKind] = useState<string>(arrae ? "invoice" : "w9");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [showId, setShowId] = useState("");
  const [visible, setVisible] = useState(true);
  const [tell, setTell] = useState(true);
  const [inputKey, setInputKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<DocRow[]>, done?: string) =>
    start(async () => {
      setError(null);
      try {
        setDocs(await fn());
        if (done) setStatus(done);
      } catch (e) {
        setError((e as Error).message);
        setStatus(null);
      }
    });
  const upload = () => {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) return setError("That file is over 25 MB. Please send a smaller copy.");
    run(async () => {
      setStatus("Uploading…");
      const slot = await actions.prepare(file.name, file.size);
      await uploadDocumentFile(file, slot);
      setStatus("Saving…");
      const next = await actions.add({ path: slot.path, fileName: file.name, contentType: file.type || null, sizeBytes: file.size, kind, title: title || file.name.replace(/\.[^.]+$/, ""), note, showId: showId || null, visibleToArtist: visible, tell });
      setFile(null);
      setTitle("");
      setNote("");
      setInputKey((k) => k + 1);
      setAdding(false);
      return next;
    }, "Added.");
  };
  const present = [...new Set(docs.map((d) => d.kind))];
  const shown = docs.filter((d) => filter === "all" || d.kind === filter);
  const field = "mt-1 w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {present.length > 1 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md bg-white px-2 py-1 text-xs ring-1 ring-line">
            <option value="all">All documents</option>
            {present.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        )}
        {!adding && (
          <button onClick={() => (setAdding(true), setStatus(null))} className="ml-auto rounded-md bg-ink px-3 py-1.5 text-xs text-white">
            + Upload a document
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 grid gap-3 rounded-lg bg-paper p-3 ring-1 ring-line sm:grid-cols-2">
          <label className="text-xs text-muted sm:col-span-2">
            File (PDF, image or document, up to 25 MB)
            <input key={inputKey} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white" />
          </label>
          <label className="text-xs text-muted">
            What is it?
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Name it (optional)
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name.replace(/\.[^.]+$/, "") ?? "e.g. Volume IV invoice"} className={field} />
          </label>
          {arrae && shows.length > 0 && (
            <label className="text-xs text-muted">
              Show (optional)
              <select value={showId} onChange={(e) => setShowId(e.target.value)} className={field}>
                <option value="">None</option>
                {shows.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-muted sm:col-span-2">
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          {arrae && (
            <div className="space-y-1 text-sm sm:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> {artistName ?? "The artist"} can see it in their studio
              </label>
              {visible && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Send them a message (and email) that it&rsquo;s there
                </label>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button onClick={() => setAdding(false)} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
              Cancel
            </button>
            <button onClick={upload} disabled={!file || pending} className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-40">
              {pending ? (status ?? "Saving…") : "Upload"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      {status && !pending && !error && <p className="mt-2 text-xs text-emerald-800">{status}</p>}

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{arrae ? "No documents yet." : "Nothing here yet. Signed agreements, invoices and payment statements will appear here."}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] ring-1 ring-line">{kindLabel(d.kind)}</span>
              <a href={d.href} target="_blank" rel="noreferrer" className="min-w-0 font-medium hover:underline">
                {d.title}
              </a>
              <span className="text-xs text-muted">
                {day(d.at)}
                {d.show && ` · ${d.show}`}
                {d.sizeBytes ? ` · ${size(d.sizeBytes)}` : ""}
                {arrae && d.byArtist && " · uploaded by the artist"}
                {!arrae && d.byArtist && " · uploaded by you"}
                {arrae && !d.visibleToArtist && " · private to ARRAE"}
              </span>
              <span className="ml-auto flex gap-3 text-xs">
                <a href={d.href.startsWith("/api/documents/") ? `${d.href}?download` : d.href} className="text-muted underline">
                  Download
                </a>
                {arrae && actions.setVisible && d.canDelete && (
                  <button disabled={pending} onClick={() => run(() => actions.setVisible!(d.id, !d.visibleToArtist))} className="text-muted underline">
                    {d.visibleToArtist ? "Hide from artist" : "Show to artist"}
                  </button>
                )}
                {d.canDelete && (
                  <button disabled={pending} onClick={() => confirm(`Remove "${d.title}"?`) && run(() => actions.remove(d.id), "Removed.")} className="text-rose-700 underline">
                    Remove
                  </button>
                )}
              </span>
              {d.note && <p className="w-full text-xs text-muted">{d.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
