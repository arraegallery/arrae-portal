"use client";

import { useEffect, useState, useTransition } from "react";
import { uploadPhotos } from "@/lib/photo-upload";
import type { Photo, UploadedPhoto, UploadSlot } from "@/lib/photos";

export type PhotoActions = {
  list: () => Promise<Photo[]>;
  prepare: (count: number) => Promise<UploadSlot[]>;
  add: (images: UploadedPhoto[], asMain: boolean) => Promise<Photo[]>;
  makeMain: (imageId: string) => Promise<Photo[]>;
  remove: (imageId: string) => Promise<Photo[]>;
};

/** All of a work's photos: upload new ones, pick the main one, remove poor ones. */
export function PhotoManager({ actions, onChange, intro }: { actions: PhotoActions; onChange?: (main: Photo | null) => void; intro?: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [asMain, setAsMain] = useState(true);
  const [inputKey, setInputKey] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    actions
      .list()
      .then((p) => live && setPhotos(p))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
    // Load once per open; the parent remounts this for another work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: Photo[]) => {
    setPhotos(next);
    onChange?.(next[0] ?? null);
  };
  const run = (fn: () => Promise<Photo[]>) =>
    start(async () => {
      setError(null);
      try {
        apply(await fn());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setProgress(null);
      }
    });
  const upload = () =>
    run(async () => {
      setProgress("Preparing…");
      const slots = await actions.prepare(files.length);
      const images = await uploadPhotos(files, slots, setProgress);
      setProgress("Saving…");
      const next = await actions.add(images, asMain);
      setFiles([]);
      setInputKey((k) => k + 1);
      return next;
    });

  return (
    <div className="rounded-lg bg-paper p-3 ring-1 ring-line">
      {intro && <p className="mb-2 text-xs text-muted">{intro}</p>}
      {photos === null && !error && <p className="text-xs text-muted">Loading photos…</p>}
      {photos && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={p.id} className="w-28 overflow-hidden rounded-md bg-white text-[11px] ring-1 ring-line">
              <a href={p.full ?? p.thumb ?? "#"} target="_blank" rel="noreferrer" className="block">
                {p.thumb || p.full ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb ?? p.full ?? ""} alt="" className="h-28 w-28 object-cover" />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center text-muted">No file</div>
                )}
              </a>
              <div className="flex items-center gap-1 p-1">
                {i === 0 ? (
                  <span className="rounded bg-ink px-1.5 py-0.5 text-white">Main</span>
                ) : (
                  <button disabled={pending} onClick={() => run(() => actions.makeMain(p.id))} className="rounded px-1.5 py-0.5 ring-1 ring-line hover:bg-paper">
                    Make main
                  </button>
                )}
                <button
                  disabled={pending}
                  onClick={() => confirm("Remove this photo?") && run(() => actions.remove(p.id))}
                  className="ml-auto rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50"
                  aria-label="Remove photo"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
          {photos.length === 0 && <li className="text-xs text-muted">No photos yet.</li>}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={pending}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white"
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={asMain} onChange={(e) => setAsMain(e.target.checked)} />
          Make the new photo the main one
        </label>
        <button onClick={upload} disabled={pending || !files.length} className="rounded-md bg-ink px-3 py-1.5 text-xs text-white disabled:opacity-40">
          {pending && progress ? progress : files.length ? `Upload ${files.length} photo${files.length === 1 ? "" : "s"}` : "Upload"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
