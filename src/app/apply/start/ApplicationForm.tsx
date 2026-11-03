"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@supabase/supabase-js";
import { BIO_MAX, BIO_MIN, CATEGORIES, MAX_WORKS, PRICE_MAX, PRICE_MIN } from "@/lib/application-fields";
import { shrink, uploadPhotos } from "@/lib/photo-upload";
import { parseAmount } from "@/lib/amount";
import { Prose } from "@/components/Prose";
import { prepareApplicationUploads, saveApplicationDraft, submitApplication } from "../actions";

type Show = { id: string; name: string; description: string | null; deadline: string | null };
type WorkDraft = { title: string; year: string; height: string; width: string; depth: string; unit: string; category: string; medium: string; description: string; price: string; processVideo: string; files: File[] };

const input = "mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-ink ring-1 ring-line focus:ring-ink";
const label = "block text-sm font-medium";
const hint = "mt-0.5 block text-xs font-normal text-muted";
const blankWork = (): WorkDraft => ({ title: "", year: "", height: "", width: "", depth: "", unit: "in", category: "", medium: "", description: "", price: "", processVideo: "", files: [] });

type Prefill = { name: string; phone: string; bio: string; social: string; website: string; education: string };
type SavedDraft = { showId?: string; f?: Partial<Prefill>; works?: Partial<Omit<WorkDraft, "files">>[] };
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function ApplicationForm({ shows, prefill, draft }: { shows: Show[]; prefill: Prefill; draft: Record<string, unknown> | null }) {
  const router = useRouter();
  const saved = (draft ?? {}) as SavedDraft;
  const restored = !!draft && (Object.values(saved.f ?? {}).some((v) => str(v).trim()) || (saved.works ?? []).some((w) => str(w.title).trim()));
  const [showId, setShowId] = useState(saved.showId && shows.some((x) => x.id === saved.showId) ? saved.showId : shows.length === 1 ? shows[0].id : "");
  const [f, setF] = useState<Prefill>(() => {
    const out = { ...prefill };
    for (const k of Object.keys(out) as (keyof Prefill)[]) if (str(saved.f?.[k]).trim()) out[k] = str(saved.f?.[k]);
    return out;
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [works, setWorks] = useState<WorkDraft[]>(() => {
    const list = (saved.works ?? []).slice(0, MAX_WORKS).map((w) => {
      const b = blankWork();
      for (const k of Object.keys(b) as (keyof WorkDraft)[]) if (k !== "files" && typeof w[k as keyof typeof w] === "string") (b as Record<string, unknown>)[k] = w[k as keyof typeof w];
      return b;
    });
    return list.length ? list : [blankWork()];
  });
  // Save the typed answers a moment after each change, so they can leave and come back.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const first = useRef(true);
  const textOnly = JSON.stringify({ showId, f, works: works.map(({ files: _files, ...rest }) => rest) });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      saveApplicationDraft(JSON.parse(textOnly))
        .then(() => setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [textOnly]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = shows.find((x) => x.id === showId);
  const setWork = (i: number, patch: Partial<WorkDraft>) => setWorks((all) => all.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const check = () => {
    if (!showId) return "Choose the show you're applying to";
    if (!f.name.trim()) return "Add your artist name";
    if (!f.phone.trim()) return "Add your phone number";
    if (f.bio.trim().length < BIO_MIN) return `Your bio/statement needs at least ${BIO_MIN} characters`;
    if (f.bio.trim().length > BIO_MAX) return `Your bio/statement can be at most ${BIO_MAX} characters`;
    if (!photo) return "Add a photo of yourself in your studio or at work";
    for (const [i, w] of works.entries()) {
      const n = `Work ${i + 1}`;
      if (!w.title.trim()) return `${n}: add a title (Untitled is fine)`;
      if (!/^\d{4}$/.test(w.year.trim())) return `${n}: the year should look like 2025`;
      if (!w.height.trim() || !w.width.trim()) return `${n}: add the height and width`;
      if (!w.category) return `${n}: choose a category`;
      if (!w.medium.trim()) return `${n}: add the medium`;
      if (!w.description.trim()) return `${n}: add a short description`;
      const p = parseAmount(w.price);
      if (!(p >= PRICE_MIN && p <= PRICE_MAX)) return `${n}: the price should be between $${PRICE_MIN} and $${PRICE_MAX.toLocaleString()}`;
      if (!w.files.length) return `${n}: add a photo`;
    }
    return null;
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const problem = check();
      if (problem) {
        setError(problem);
        return;
      }
      try {
        setProgress("Preparing your uploads…");
        const cvExt = cv ? (cv.name.split(".").pop() ?? "pdf") : null;
        const prep = await prepareApplicationUploads({ photosPerWork: works.map((w) => w.files.length), artistPhoto: true, cvExt });
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const bucket = supabase.storage.from("artworks");
        setProgress("Uploading your photo…");
        const me = await shrink(photo!, 2000);
        const a = await bucket.uploadToSignedUrl(prep.photo!.path, prep.photo!.token, me.blob, { contentType: "image/jpeg" });
        if (a.error) throw new Error(`Your photo didn't upload: ${a.error.message}`);
        let cvPath: string | null = null;
        if (cv && prep.cv) {
          setProgress("Uploading your CV…");
          const c = await bucket.uploadToSignedUrl(prep.cv.path, prep.cv.token, cv, { contentType: cv.type || "application/pdf" });
          if (c.error) throw new Error(`Your CV didn't upload: ${c.error.message}`);
          cvPath = prep.cv.path;
        }
        const out = [];
        for (const [i, w] of works.entries()) {
          const images = await uploadPhotos(w.files, prep.works[i].slots, (t) => setProgress(`Work ${i + 1}: ${t.toLowerCase()}`));
          const { files: _files, ...rest } = w;
          void _files;
          out.push({ ...rest, workId: prep.works[i].workId, images });
        }
        setProgress("Sending your application…");
        const r = await submitApplication({ showId, ...f, photoPath: prep.photo!.path, cvPath, works: out });
        if (!r.ok) throw new Error(r.error);
        router.push(`/apply/done?show=${encodeURIComponent(r.value.show)}`);
      } catch (e) {
        setError((e as Error).message);
        setProgress(null);
      }
    });

  return (
    <div className="mt-6 space-y-8">
      <p className="rounded-md bg-paper px-3 py-2 text-xs text-muted ring-1 ring-line">
        {restored ? "Welcome back. We kept the answers you typed last time. " : ""}
        Your answers save as you type, so you can leave and finish later by signing in with the same email. Photos and files aren&rsquo;t kept until you submit, so add them when you&rsquo;re ready to send.
        {savedAt && <span className="ml-1 text-emerald-800">Saved {savedAt}.</span>}
      </p>
      <section className="rounded-lg bg-white p-5 ring-1 ring-line">
        <label className={label}>
          Which show are you applying to?
          <select value={showId} onChange={(e) => setShowId(e.target.value)} className={input}>
            {shows.length > 1 && <option value="">Choose a show…</option>}
            {shows.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        {show?.description && <Prose text={show.description} className="mt-3 text-muted" />}
        {show?.deadline && <p className="mt-2 text-xs text-muted">Applications close {new Date(`${show.deadline}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.</p>}
      </section>

      <section className="space-y-4 rounded-lg bg-white p-5 ring-1 ring-line">
        <h2 className="font-display text-2xl">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Artist name
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} autoComplete="name" />
          </label>
          <label className={label}>
            Phone
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} type="tel" autoComplete="tel" />
          </label>
        </div>
        <label className={label}>
          Bio / statement
          <span className={hint}>
            {BIO_MIN} to {BIO_MAX} characters.
          </span>
          <textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} className={`${input} h-40`} />
          <span className={`${hint} ${f.bio.trim().length && (f.bio.trim().length < BIO_MIN || f.bio.trim().length > BIO_MAX) ? "text-rose-700" : ""}`}>{f.bio.trim().length} characters</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Instagram / social <span className="font-normal text-muted">(optional)</span>
            <input value={f.social} onChange={(e) => setF({ ...f, social: e.target.value })} placeholder="@yourname" className={input} />
          </label>
          <label className={label}>
            Website <span className="font-normal text-muted">(optional)</span>
            <input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Education <span className="font-normal text-muted">(optional)</span>
            <input value={f.education} onChange={(e) => setF({ ...f, education: e.target.value })} className={input} />
          </label>
        </div>
        <label className={label}>
          A photo of you
          <span className={hint}>In your studio or working on your art, please, not a plain headshot. If you&rsquo;re accepted, we may use it on our website and in marketing.</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-2 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white" />
        </label>
        <label className={label}>
          CV <span className="font-normal text-muted">(optional, PDF or Word)</span>
          <input type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={(e) => setCv(e.target.files?.[0] ?? null)} className="mt-2 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white" />
        </label>
      </section>

      {works.map((w, i) => (
        <section key={i} className="space-y-4 rounded-lg bg-white p-5 ring-1 ring-line">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-2xl">Work {i + 1}</h2>
            {i > 0 && (
              <button onClick={() => setWorks(works.filter((_, j) => j !== i))} className="ml-auto text-sm text-muted underline">
                Remove
              </button>
            )}
          </div>
          <label className={label}>
            Photos
            <span className={hint}>
              Up to 3; the first is the main one. A high-quality JPEG, at least 3,000 px on the longest side, in even daylight with no glare, straight on, filling the frame, on a white or
              neutral background.
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setWork(i, { files: Array.from(e.target.files ?? []).slice(0, 3) })}
              className="mt-2 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white"
            />
          </label>
          {w.files.length > 0 && (
            <div className="flex gap-2">
              {w.files.map((file, j) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={j} src={URL.createObjectURL(file)} alt="" className="h-20 w-20 rounded object-cover ring-1 ring-line" />
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <label className={`${label} sm:col-span-3`}>
              Title
              <span className={hint}>Untitled pieces are accepted, but titles are strongly preferred.</span>
              <input value={w.title} onChange={(e) => setWork(i, { title: e.target.value })} className={input} />
            </label>
            <label className={label}>
              Year
              <span className={hint}>For example, 2025</span>
              <input value={w.year} onChange={(e) => setWork(i, { year: e.target.value })} inputMode="numeric" maxLength={4} className={input} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <label className={label}>
              Height
              <input value={w.height} onChange={(e) => setWork(i, { height: e.target.value })} inputMode="decimal" className={input} />
            </label>
            <label className={label}>
              Width
              <input value={w.width} onChange={(e) => setWork(i, { width: e.target.value })} inputMode="decimal" className={input} />
            </label>
            <label className={label}>
              Depth <span className="font-normal text-muted">(optional)</span>
              <input value={w.depth} onChange={(e) => setWork(i, { depth: e.target.value })} inputMode="decimal" className={input} />
            </label>
            <label className={label}>
              Unit
              <select value={w.unit} onChange={(e) => setWork(i, { unit: e.target.value })} className={input}>
                <option value="in">inches</option>
                <option value="cm">cm</option>
              </select>
            </label>
            <label className={label}>
              Price (USD)
              <input value={w.price} onChange={(e) => setWork(i, { price: e.target.value })} inputMode="decimal" placeholder="1200" className={input} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Category
              <select value={w.category} onChange={(e) => setWork(i, { category: e.target.value })} className={input}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Medium
              <input value={w.medium} onChange={(e) => setWork(i, { medium: e.target.value })} placeholder="Oil on canvas" className={input} />
            </label>
          </div>
          <label className={label}>
            Description
            <textarea value={w.description} onChange={(e) => setWork(i, { description: e.target.value })} className={`${input} h-24`} />
          </label>
          <label className={label}>
            Process video <span className="font-normal text-muted">(optional)</span>
            <span className={hint}>A link to an Instagram Reel, TikTok or YouTube clip of your process for this work.</span>
            <input value={w.processVideo} onChange={(e) => setWork(i, { processVideo: e.target.value })} placeholder="https://" className={input} />
          </label>
        </section>
      ))}
      {works.length < MAX_WORKS && (
        <button onClick={() => setWorks([...works, blankWork()])} className="w-full rounded-lg border border-dashed border-line py-4 text-sm text-muted hover:bg-white">
          + Add another work ({works.length} of {MAX_WORKS})
        </button>
      )}

      <section className="rounded-lg bg-white p-5 ring-1 ring-line">
        {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
        <button onClick={submit} disabled={pending} className="w-full rounded-md bg-ink px-4 py-3 text-sm text-white disabled:opacity-60">
          {pending ? (progress ?? "Sending…") : `Submit my application${show ? ` for ${show.name}` : ""}`}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Please keep this page open until it says thank you. Large photos can take a minute.</p>
      </section>
    </div>
  );
}
