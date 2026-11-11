"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveWallSetup } from "../../actions";
import { formatPrice, formatSize } from "@/components/ArtworkImage";
import type { SandboxWork } from "@/lib/queries";
import { feetInches, hangWorks, type Wall, type WallSetup } from "@/lib/walls";

/** Room left of each wall for the person drawn for scale, in inches. */
const GUTTER = 26;
const PERSON = 66;

export function ScaleWall({
  items,
  setup,
  selected,
  dragging,
  onToggle,
  onDragStartWork,
  onDragEndWork,
  onDropOnWork,
}: {
  items: SandboxWork[];
  setup: WallSetup;
  selected: Set<string>;
  dragging: string | null;
  onToggle: (id: string) => void;
  onDragStartWork: (e: React.DragEvent, id: string) => void;
  onDragEndWork: () => void;
  onDropOnWork: (e: React.DragEvent, id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [editing, setEditing] = useState(false);
  const hung = useMemo(() => hangWorks(items, setup), [items, setup]);
  const widest = Math.max(...hung.map((h) => h.wall.width));
  const scale = Math.max(0.5, px / (widest + GUTTER)); // pixels per inch
  const noSize = items.filter((w) => !w.width || !w.height).length;
  const overflowCount = hung.filter((h) => h.overflow).reduce((n, h) => n + h.placed.length, 0);

  return (
    <div ref={box}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {setup.walls.length} wall{setup.walls.length === 1 ? "" : "s"} · hung at {feetInches(setup.center)} to centre · at least {feetInches(setup.gap)} apart
        </span>
        {noSize > 0 && <span className="text-amber-800">{noSize} without a size, shown as dashed 12″ squares</span>}
        {overflowCount > 0 && <span className="text-red-700">{overflowCount} don&apos;t fit on the walls yet</span>}
        <button onClick={() => setEditing((v) => !v)} className="ml-auto rounded-md bg-white px-2.5 py-1 text-sm text-ink ring-1 ring-line hover:bg-paper">
          {editing ? "Close" : "Edit walls"}
        </button>
      </div>
      {!setup.measured && !editing && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          These walls are a placeholder (20′ wide, 10′ high). Click <b>Edit walls</b> and type in the real measurements so the
          sizes are true.
        </p>
      )}
      {editing && <WallEditor setup={setup} onDone={() => setEditing(false)} />}

      <div className="space-y-8">
        {hung.map((h, i) => {
          const W = h.wall.width * scale;
          const H = h.wall.height * scale;
          const g = GUTTER * scale;
          return (
            <figure key={i}>
              <figcaption className="mb-1 flex items-baseline gap-2 text-sm">
                <span className={`font-medium ${h.overflow ? "text-red-700" : ""}`}>{h.wall.name}</span>
                <span className="text-xs text-muted">
                  {feetInches(h.wall.width)} × {feetInches(h.wall.height)} · {h.placed.length} work{h.placed.length === 1 ? "" : "s"}
                  {h.placed.length > 0 && ` · ${feetInches(h.free)} of wall not covered by art`}
                </span>
              </figcaption>
              <div className="relative" style={{ width: g + W, height: H + 22 }}>
                {/* Person for scale */}
                <Person height={PERSON * scale} left={g / 2} bottom={22} />
                <div
                  className={`absolute top-0 overflow-hidden ${h.overflow ? "bg-red-50/60 outline-dashed outline-1 outline-red-300" : "bg-[#fbfaf7] shadow-[inset_0_-3px_0_#cfc7b8] ring-1 ring-[#e2dccf]"}`}
                  style={{ left: g, width: W, height: H }}
                >
                  {/* Hanging line */}
                  <div className="pointer-events-none absolute inset-x-0 border-t border-dotted border-[#d6cfc2]" style={{ top: (h.wall.height - setup.center) * scale }} />
                  {h.placed.map((p) => {
                    const w = p.item;
                    const isSel = selected.has(w.id);
                    return (
                      <div
                        key={w.id}
                        draggable
                        onDragStart={(e) => onDragStartWork(e, w.id)}
                        onDragEnd={onDragEndWork}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDropOnWork(e, w.id);
                        }}
                        onClick={() => onToggle(w.id)}
                        title={`${w.artistName}, ${w.title}\n${formatSize(w)} · ${formatPrice(w.price)}${p.known ? "" : "\nNo size given: shown as a 12″ square"}`}
                        className={`group absolute cursor-grab overflow-hidden bg-[#efebe4] shadow-[2px_3px_6px_rgba(0,0,0,0.18)] active:cursor-grabbing ${
                          p.known ? "" : "outline-dashed outline-2 outline-amber-500"
                        } ${isSel ? "ring-2 ring-ink ring-offset-2" : ""} ${dragging === w.id ? "opacity-40" : ""}`}
                        style={{
                          left: p.x * scale,
                          top: (h.wall.height - p.y - p.height) * scale,
                          width: p.width * scale,
                          height: p.height * scale,
                        }}
                      >
                        {w.image?.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={w.image.thumb} alt={w.title} draggable={false} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center p-0.5 text-center text-[9px] leading-tight text-muted">{w.title}</span>
                        )}
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white group-hover:block">
                          {w.title} · {p.known ? `${feetInches(p.height)} × ${feetInches(p.width)}` : "no size"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Ruler left={g} width={h.wall.width} scale={scale} top={H} />
              </div>
            </figure>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">
        Works hang in your sandbox order, left to right, wall by wall. Drag a work onto another to swap places. Hover for its title and size.
        Where a photo is clearly landscape but the size reads portrait (or the other way round), the photo wins.
      </p>
    </div>
  );
}

function Ruler({ left, width, scale, top }: { left: number; width: number; scale: number; top: number }) {
  const feet = Math.floor(width / 12);
  const every = width > 600 ? 5 : width > 300 ? 2 : 1;
  return (
    <div className="absolute h-[22px] text-[10px] text-muted" style={{ left, top, width: width * scale }}>
      {Array.from({ length: feet + 1 }, (_, f) => (
        <span key={f} className="absolute top-0 border-l border-[#bdb4a4]" style={{ left: f * 12 * scale, height: f % every === 0 ? 8 : 4 }}>
          {f % every === 0 && f > 0 && <span className="absolute left-0.5 top-1.5 whitespace-nowrap">{f}′</span>}
        </span>
      ))}
    </div>
  );
}

function Person({ height, left, bottom }: { height: number; left: number; bottom: number }) {
  const w = height * 0.28;
  return (
    <svg
      viewBox="0 0 28 100"
      className="absolute text-[#cbc3b4]"
      style={{ height, width: w, left: left - w / 2, bottom }}
      aria-label="Person, 5′6″, for scale"
    >
      <title>5′6″ person for scale</title>
      <circle cx="14" cy="7" r="6" fill="currentColor" />
      <rect x="6" y="15" width="16" height="40" rx="5" fill="currentColor" />
      <rect x="7.5" y="50" width="5.5" height="50" rx="2.5" fill="currentColor" />
      <rect x="15" y="50" width="5.5" height="50" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function splitFt(inches: number) {
  const ft = Math.floor(inches / 12);
  return { ft: String(ft), inch: String(Math.round((inches - ft * 12) * 10) / 10) };
}

function WallEditor({ setup, onDone }: { setup: WallSetup; onDone: () => void }) {
  type Row = { name: string; wFt: string; wIn: string; hFt: string; hIn: string };
  const toRow = (w: Wall): Row => {
    const a = splitFt(w.width);
    const b = splitFt(w.height);
    return { name: w.name, wFt: a.ft, wIn: a.inch, hFt: b.ft, hIn: b.inch };
  };
  const [rows, setRows] = useState<Row[]>(setup.walls.map(toRow));
  const [gap, setGap] = useState(String(setup.gap));
  const [center, setCenter] = useState(String(setup.center));
  const [saving, start] = useTransition();
  const n = (s: string) => Number(s.replace(",", ".")) || 0;
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const input = "w-14 rounded-md px-1.5 py-1 ring-1 ring-line";

  return (
    <form
      className="mb-4 rounded-lg bg-white p-3 text-sm ring-1 ring-line"
      onSubmit={(e) => {
        e.preventDefault();
        const walls = rows
          .map((r, i) => ({ name: r.name.trim() || `Wall ${i + 1}`, width: n(r.wFt) * 12 + n(r.wIn), height: n(r.hFt) * 12 + n(r.hIn) }))
          .filter((w) => w.width > 0 && w.height > 0);
        if (!walls.length) return;
        start(async () => {
          await saveWallSetup({ walls, gap: n(gap), center: n(center), measured: true });
          onDone();
        });
      }}
    >
      <p className="mb-2 text-muted">Measure each wall you hang on, in the order you want works to go. Feet and inches both work.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder={`Wall ${i + 1}`} className="w-40 rounded-md px-2 py-1 ring-1 ring-line" aria-label="Wall name" />
            <span className="text-muted">wide</span>
            <input inputMode="decimal" value={r.wFt} onChange={(e) => set(i, "wFt", e.target.value)} className={input} aria-label="Width feet" />
            <span>ft</span>
            <input inputMode="decimal" value={r.wIn} onChange={(e) => set(i, "wIn", e.target.value)} className={input} aria-label="Width inches" />
            <span>in</span>
            <span className="ml-2 text-muted">high</span>
            <input inputMode="decimal" value={r.hFt} onChange={(e) => set(i, "hFt", e.target.value)} className={input} aria-label="Height feet" />
            <span>ft</span>
            <input inputMode="decimal" value={r.hIn} onChange={(e) => set(i, "hIn", e.target.value)} className={input} aria-label="Height inches" />
            <span>in</span>
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="ml-1 text-muted hover:text-ink" aria-label="Remove wall">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((r) => [...r, { name: `Wall ${r.length + 1}`, wFt: "10", wIn: "0", hFt: "10", hIn: "0" }])}
        className="mt-2 text-sm underline"
      >
        + Add a wall
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-muted">Centre of each work</span>
        <input inputMode="decimal" value={center} onChange={(e) => setCenter(e.target.value)} className={input} aria-label="Centre height in inches" />
        <span>in from the floor</span>
        <span className="ml-4 text-muted">At least</span>
        <input inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} className={input} aria-label="Gap in inches" />
        <span>in between works</span>
        <button disabled={saving} className="ml-auto rounded-md bg-ink px-3 py-1.5 text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save walls"}
        </button>
      </div>
    </form>
  );
}
