"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@supabase/supabase-js";
import type { SheetData, SheetWork } from "@/lib/artist-sheet";
import { formatPrice, formatSize } from "@/components/ArtworkImage";
import { shrink } from "@/lib/photo-upload";
import { prepareHeadshotUpload, saveHeadshot } from "./actions";

const MAX_WORKS = 12;
const BIO_PT = 10;
const MIN_BIO_PT = 7.5;
/** Below this, pictures on the sheet are too small to sell from (about 1.25 inches). */
const MIN_PICTURE_PX = 120;

type Settings = { picked: string[]; prices: boolean; sizes: boolean; photo: boolean; bioSource: "arrae" | "own" };

function columnsFor(n: number) {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 6 || n === 9) return 3;
  return 4;
}

const clean = (t: string) =>
  t
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");

/** Best guess at Instagram handles from the free-text "social" field (it holds anything artists typed). */
export function instagramGuess(social: string | null) {
  const t = social?.trim() ?? "";
  if (!t) return "";
  const found = new Set<string>();
  for (const m of t.matchAll(/instagram\.com\/([A-Za-z0-9._]+)/gi)) found.add(`@${m[1]}`);
  for (const m of t.matchAll(/(?:^|[\s,(:&/])@([A-Za-z0-9._]{2,})/g)) found.add(`@${m[1]}`);
  if (!found.size) {
    const m = t.match(/\b(?:ig|instagram)\s*[:@]\s*@?([A-Za-z0-9._]{3,})/i) ?? t.match(/^@?([A-Za-z0-9._]{3,})$/);
    if (m) found.add(`@${m[1]}`);
  }
  return [...found]
    .filter((h) => !/^@(instagram|ig|facebook|fb|n\/?a|none|x)$/i.test(h))
    .slice(0, 2)
    .join("  ");
}

/** A tidy website address, or nothing for placeholders and share links. */
export function websiteGuess(website: string | null) {
  const t = website?.trim() ?? "";
  if (!t || /\s/.test(t) || !t.includes(".")) return "";
  const w = clean(t).toLowerCase();
  if (/^(instagram|facebook|canva|x|twitter|tiktok)\.com/.test(w) || /^docs\.google/.test(w)) return "";
  return w;
}

function today() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function ProfileSheet({ data, owner }: { data: SheetData; owner: boolean }) {
  const { artist } = data;
  const storeKey = `profile-sheet:${artist.id}`;
  const defaults: Settings = {
    picked: data.works.filter((w) => w.suggested).map((w) => w.id),
    prices: true,
    sizes: true,
    photo: true,
    bioSource: artist.arraeBio.trim() ? "arrae" : "own",
  };
  const [settings, setSettings] = useState<Settings>(defaults);
  const [bio, setBio] = useState((defaults.bioSource === "arrae" ? artist.arraeBio : artist.ownBio).trim());
  const [headshot, setHeadshot] = useState(data.headshot);
  const [links, setLinks] = useState({ instagram: instagramGuess(artist.social), website: websiteGuess(artist.website) });
  const [note, setNote] = useState<string | null>(null);

  // The last choices for this artist come back when the page is opened again (this browser only).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null") as Partial<Settings> | null;
      if (saved) {
        const known = new Set(data.works.map((w) => w.id));
        const next = { ...defaults, ...saved, picked: (saved.picked ?? defaults.picked).filter((id) => known.has(id)) };
        setSettings(next);
        if (next.bioSource !== defaults.bioSource) setBio((next.bioSource === "arrae" ? artist.arraeBio : artist.ownBio).trim());
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function update(change: Partial<Settings>) {
    setSettings((cur) => {
      const next = { ...cur, ...change };
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const byId = useMemo(() => new Map(data.works.map((w) => [w.id, w])), [data.works]);
  const works = settings.picked.map((id) => byId.get(id)).filter((w): w is SheetWork => !!w);
  const cols = columnsFor(works.length);
  const rows = Math.max(1, Math.ceil(works.length / cols));

  function toggle(id: string) {
    const on = settings.picked.includes(id);
    if (!on && settings.picked.length >= MAX_WORKS) {
      setNote(`One page fits up to ${MAX_WORKS} works. Untick one first.`);
      return;
    }
    setNote(null);
    // Keep the order of the list, so ticking a work puts it where it sits in the list.
    const next = on ? settings.picked.filter((x) => x !== id) : data.works.map((w) => w.id).filter((x) => x === id || settings.picked.includes(x));
    update({ picked: next });
  }
  function chooseBio(source: "arrae" | "own") {
    update({ bioSource: source });
    setBio((source === "arrae" ? artist.arraeBio : artist.ownBio).trim());
  }

  // Fit to one page: the bio shrinks a little at a time until the pictures have room.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [bioPt, setBioPt] = useState(BIO_PT);
  const [tooFull, setTooFull] = useState(false);
  const layoutKey = `${settings.picked.join(",")}|${bio}|${settings.photo}|${settings.prices}|${settings.sizes}|${!!headshot}|${links.instagram}|${links.website}`;
  const measuredKey = useRef(layoutKey);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (measuredKey.current !== layoutKey) {
      measuredKey.current = layoutKey;
      if (bioPt !== BIO_PT) {
        setBioPt(BIO_PT);
        return;
      }
    }
    const boxes = [...sheet.querySelectorAll<HTMLElement>("[data-picture-box]")];
    const smallest = boxes.length ? Math.min(...boxes.map((b) => b.clientHeight)) : Infinity;
    const overflow = sheet.scrollHeight > sheet.clientHeight + 1;
    const cramped = overflow || smallest < MIN_PICTURE_PX;
    if (cramped && bioPt > MIN_BIO_PT) setBioPt((p) => Math.max(MIN_BIO_PT, p - 0.5));
    else setTooFull(cramped);
  }, [bioPt, layoutKey]);

  // Pictures: count what has loaded so printing waits for all of them.
  const [loaded, setLoaded] = useState<Record<string, "ok" | "failed">>({});
  const pictureIds = [...works.map((w) => w.id), ...(settings.photo && headshot ? ["headshot"] : [])];
  const ready = pictureIds.filter((id) => loaded[id]).length;
  const failed = pictureIds.filter((id) => loaded[id] === "failed");
  const [printing, setPrinting] = useState(false);
  const allIn = ready === pictureIds.length;
  useEffect(() => {
    if (printing && allIn) {
      setPrinting(false);
      if (!failed.length) setTimeout(() => window.print(), 150);
    }
  }, [printing, allIn, failed.length]);
  function print() {
    if (allIn && !failed.length) window.print();
    else setPrinting(true);
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24 print:m-0 print:max-w-none print:p-0">
      <div className="py-5 print:hidden">
        <Link href={`/admin/artists/${encodeURIComponent(artist.id)}`} className="text-sm text-muted hover:underline">
          ← Back to {artist.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl">Printable profile</h1>
        <p className="mt-1 text-sm text-muted">One letter-size page for sales and marketing. Pick the works on the right, then press Print. To get a PDF, choose “Save as PDF” in the print window.</p>
      </div>

      <div className="flex flex-col-reverse gap-6 xl:flex-row xl:items-start print:block">
        <div className="overflow-x-auto pb-4 print:overflow-visible print:p-0">
          <div
            ref={sheetRef}
            className="sheet relative mx-auto flex h-[11in] w-[8.5in] shrink-0 flex-col overflow-hidden bg-white px-[0.55in] pb-[0.45in] pt-[0.5in] text-ink shadow-[0_2px_24px_rgba(0,0,0,0.12)] ring-1 ring-line print:mx-0 print:shadow-none print:ring-0"
          >
            <header className="flex items-end justify-between border-b border-ink pb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-[0.34in] w-auto" />
              <span className="text-[7.5pt] uppercase tracking-[0.25em] text-muted">Artist profile</span>
            </header>

            <section className="mt-[0.28in] flex gap-[0.3in]">
              {settings.photo && headshot && (
                <div className="w-[1.85in] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={(img) => {
                      if (img?.complete && img.naturalWidth && !loaded.headshot) setTimeout(() => setLoaded((l) => ({ ...l, headshot: "ok" })));
                    }}
                    src={headshot.src}
                    alt={artist.name}
                    loading="eager"
                    onLoad={() => setLoaded((l) => ({ ...l, headshot: "ok" }))}
                    onError={() => setLoaded((l) => ({ ...l, headshot: "failed" }))}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[26pt] leading-[1.05]">{artist.name}</h2>
                <Facts collection={artist.collection} links={links} works={works} exhibited={data.exhibited} />
                {bio && (
                  <div className="mt-[0.14in] space-y-[0.5em] leading-[1.45] text-ink/90" style={{ fontSize: `${bioPt}pt` }}>
                    {bio.split(/\n\s*\n/).map((p, i) => (
                      <p key={i}>{p.replace(/\s*\n\s*/g, " ")}</p>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {works.length > 0 && (
              <section className="mt-[0.3in] flex min-h-0 flex-1 flex-col">
                <h3 className="text-[7.5pt] uppercase tracking-[0.25em] text-muted">{works.length === 1 ? "Featured work" : "Selected works"}</h3>
                <div
                  className="mt-[0.12in] grid min-h-0 flex-1 gap-x-[0.22in] gap-y-[0.18in]"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
                >
                  {works.map((w) => (
                    <WorkCell
                      key={w.id}
                      work={w}
                      prices={settings.prices}
                      sizes={settings.sizes}
                      onState={(state) => setLoaded((l) => (l[w.id] === state ? l : { ...l, [w.id]: state }))}
                    />
                  ))}
                </div>
              </section>
            )}

            <footer className="mt-auto flex items-end justify-between gap-4 border-t border-line pt-2 text-[7pt] text-muted">
              <span>
                <span className="font-medium text-ink">ARRAE Gallery</span> · 3680 Grand Avenue, Miami, FL 33133 · arraegallery.com · hello@arraegallery.com
              </span>
              {settings.prices && <span className="shrink-0">Prices and availability as of {today()}</span>}
            </footer>
          </div>
        </div>

        <aside className="w-full space-y-5 xl:sticky xl:top-20 xl:w-[380px] xl:shrink-0 print:hidden">
          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <button onClick={print} disabled={works.length === 0 || printing} className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {printing ? `Getting pictures ready… ${ready} of ${pictureIds.length}` : "Print or save as PDF"}
            </button>
            <p className="mt-2 text-xs text-muted">
              {works.length === 0
                ? "Tick at least one work below."
                : allIn
                  ? `All ${pictureIds.length} pictures are ready.`
                  : `Loading pictures: ${ready} of ${pictureIds.length}. The print window opens once they are all in.`}
            </p>
            {failed.length > 0 && allIn && (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs ring-1 ring-amber-200">
                {failed.length === 1 ? "1 picture" : `${failed.length} pictures`} didn’t load
                {failed.filter((id) => id !== "headshot").length ? `: ${failed.filter((id) => id !== "headshot").map((id) => byId.get(id)?.title).join(", ")}` : " (the headshot)"}.{" "}
                <button onClick={() => location.reload()} className="underline">
                  Reload the page
                </button>{" "}
                or{" "}
                <button onClick={() => window.print()} className="underline">
                  print anyway
                </button>
                .
              </div>
            )}
            {tooFull && (
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs ring-1 ring-amber-200">
                The page is crowded, so the pictures are small. Shorten the bio below or untick a few works.
              </p>
            )}
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs uppercase tracking-wider text-muted">
                Works on the page ({works.length} of up to {MAX_WORKS})
              </h2>
              <span className="space-x-3 text-xs">
                <button onClick={() => update({ picked: defaults.picked })} className="text-muted hover:text-ink hover:underline">
                  Suggested
                </button>
                <button onClick={() => update({ picked: [] })} className="text-muted hover:text-ink hover:underline">
                  Clear
                </button>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">Suggested: works still for sale that were in a show or are on the shop. Sold and archived works start unticked.</p>
            {note && <p className="mt-2 text-xs text-red-700">{note}</p>}
            <ul className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {data.works.map((w) => (
                <li key={w.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md p-1.5 hover:bg-paper">
                    <input type="checkbox" checked={settings.picked.includes(w.id)} onChange={() => toggle(w.id)} className="h-4 w-4 accent-ink" />
                    {w.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.thumb} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded object-cover ring-1 ring-line" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded bg-paper ring-1 ring-line" />
                    )}
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{w.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {w.sold ? "Sold" : formatPrice(w.price)}
                        {w.shows[0] ? ` · ${w.shows[0]}` : ""}
                        {w.onShopify ? " · On the shop" : ""}
                        {!w.thumb && !w.full ? " · No picture" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-line">
            <h2 className="text-xs uppercase tracking-wider text-muted">Links</h2>
            <label className="mt-2 block">
              <span className="text-xs text-muted">Instagram</span>
              <input value={links.instagram} onChange={(e) => setLinks({ ...links, instagram: e.target.value })} placeholder="@handle" className="mt-0.5 w-full rounded-md px-3 py-1.5 ring-1 ring-line focus:ring-ink" />
            </label>
            <label className="mt-2 block">
              <span className="text-xs text-muted">Website</span>
              <input value={links.website} onChange={(e) => setLinks({ ...links, website: e.target.value })} placeholder="their-site.com" className="mt-0.5 w-full rounded-md px-3 py-1.5 ring-1 ring-line focus:ring-ink" />
            </label>
            <p className="mt-1 text-xs text-muted">
              Filled in from what the artist typed{artist.collection ? "; the shop link is added on its own" : ""}. Edits here only change this printout.
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <h2 className="text-xs uppercase tracking-wider text-muted">Bio</h2>
            <div className="mt-2 flex gap-2 text-xs">
              {(
                [
                  ["arrae", "ARRAE bio", artist.arraeBio],
                  ["own", "Artist’s own statement", artist.ownBio],
                ] as const
              ).map(([k, label, text]) => (
                <button
                  key={k}
                  onClick={() => chooseBio(k)}
                  disabled={!text.trim()}
                  className={`rounded-full px-3 py-1 ring-1 disabled:opacity-40 ${settings.bioSource === k ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="mt-2 h-44 w-full rounded-md bg-white px-3 py-2 text-sm leading-relaxed ring-1 ring-line focus:ring-ink" />
            <p className="mt-1 text-xs text-muted">Edits here only change this printout. The saved bio on the artist page stays as it is.</p>
          </div>

          <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-line">
            <h2 className="text-xs uppercase tracking-wider text-muted">Show on the page</h2>
            <div className="mt-2 space-y-1.5">
              <Check label="Prices" checked={settings.prices} onChange={(v) => update({ prices: v })} />
              <Check label="Sizes" checked={settings.sizes} onChange={(v) => update({ sizes: v })} />
              <Check label="Headshot" checked={settings.photo} onChange={(v) => update({ photo: v })} disabled={!headshot} />
            </div>
            <HeadshotTools artistId={artist.id} owner={owner} headshot={headshot} onChange={(src) => setHeadshot({ src, from: "portal" })} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Facts({ collection, links, works, exhibited }: { collection: string | null; links: { instagram: string; website: string }; works: SheetWork[]; exhibited: string[] }) {
  const mediums = [...new Set(works.map((w) => w.category?.trim()).filter((c): c is string => !!c))].slice(0, 4);
  const list = [links.instagram.trim(), links.website.trim(), collection ? `arraegallery.com/collections/${collection}` : ""].filter(Boolean);
  return (
    <div className="mt-[0.08in] space-y-[0.03in] text-[8.5pt] text-muted">
      {mediums.length > 0 && <p className="text-[7.5pt] uppercase tracking-[0.15em] text-ink">{mediums.join(" · ")}</p>}
      {list.length > 0 && <p className="text-ink/80">{list.join("   ·   ")}</p>}
      {exhibited.length > 0 && <p>Exhibited at ARRAE: {exhibited.join(", ")}</p>}
    </div>
  );
}

function WorkCell({ work, prices, sizes, onState }: { work: SheetWork; prices: boolean; sizes: boolean; onState: (s: "ok" | "failed") => void }) {
  const first = work.full ?? work.thumb;
  const [src, setSrc] = useState(first);
  const tries = useRef(0);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!first) onState("failed");
    // A picture that loaded before the page came alive doesn't fire onLoad again.
    else if (img.current?.complete && img.current.naturalWidth) onState("ok");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function failed() {
    tries.current++;
    // Try the same picture again once (the image server sometimes is busy), then the smaller copy.
    if (tries.current === 1 && src) setTimeout(() => setSrc(`${src}${src.includes("?") ? "&" : "?"}retry=1`), 800);
    else if (tries.current === 2 && work.thumb && work.thumb !== first) setSrc(work.thumb);
    else onState("failed");
  }
  const size = formatSize(work);
  const line = [work.year, work.medium].filter(Boolean).join(" · ");
  return (
    <figure className="flex min-h-0 flex-col">
      <div data-picture-box className="relative min-h-0 flex-1">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={img} src={src} alt={work.title} loading="eager" onLoad={() => onState("ok")} onError={failed} className="absolute inset-0 h-full w-full object-contain object-left-bottom" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-paper text-[8pt] text-muted">No picture</div>
        )}
      </div>
      <figcaption className="mt-[0.07in] shrink-0 text-[7.5pt] leading-[1.35]">
        <span className="block truncate font-display text-[9pt] italic">{work.title}</span>
        {line && <span className="block truncate text-muted">{line}</span>}
        {sizes && size !== "Size not given" && <span className="block truncate text-muted">{size}</span>}
        {prices && <span className="block font-medium">{work.sold ? "Sold" : work.price !== null ? formatPrice(work.price) : "Price on request"}</span>}
      </figcaption>
    </figure>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-ink" />
      {label}
    </label>
  );
}

function HeadshotTools({ artistId, owner, headshot, onChange }: { artistId: string; owner: boolean; headshot: SheetData["headshot"]; onChange: (src: string) => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  function upload(file: File) {
    setMsg(null);
    start(async () => {
      try {
        const slot = await prepareHeadshotUpload(artistId);
        const { blob } = await shrink(file, 1600);
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const r = await supabase.storage.from("artworks").uploadToSignedUrl(slot.path, slot.token, blob, { contentType: "image/jpeg" });
        if (r.error) throw new Error(`The photo didn't upload: ${r.error.message}`);
        const src = await saveHeadshot(artistId, slot.path);
        if (src) onChange(src);
        setMsg("Saved. This is now the artist’s headshot in the portal.");
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  }
  const where = !headshot
    ? "No headshot yet. The portal has no photo for this artist and their shop collection has no picture."
    : headshot.from === "shopify"
      ? "Headshot comes from the artist’s collection picture on the shop."
      : "Headshot comes from the photo saved in the portal.";
  return (
    <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
      <p>{where}</p>
      {owner && (
        <>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button onClick={() => input.current?.click()} disabled={pending} className="mt-2 rounded-md bg-white px-3 py-1.5 text-ink ring-1 ring-line hover:ring-ink disabled:opacity-50">
            {pending ? "Uploading…" : headshot ? "Upload a different headshot" : "Upload a headshot"}
          </button>
        </>
      )}
      {msg && <p className="mt-2 text-ink">{msg}</p>}
    </div>
  );
}
