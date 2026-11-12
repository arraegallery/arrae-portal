"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveSandboxLayout, saveWallSetup } from "../../actions";
import { formatPrice, formatSize } from "@/components/ArtworkImage";
import type { SandboxWork } from "@/lib/queries";
import { feetInches, hangWorks, realSize, UNKNOWN_SIZE, type Wall, type WallLayout, type WallSetup, type WallSpot } from "@/lib/walls";

/** Room left of each wall for the person drawn for scale, in inches. */
const GUTTER = 26;
const PERSON = 66;

type Drag = {
  id: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  grabX: number;
  grabY: number;
  moved: boolean;
};

/**
 * The sandbox at true scale. Works start in a neat line in sandbox order; drag any of them
 * anywhere on any wall, floor to ceiling, to build a salon-style collage. Spots are saved per show.
 */
export function ScaleWall({
  items,
  setup,
  layout: initialLayout,
  showId,
  selected,
  onToggle,
}: {
  items: SandboxWork[];
  setup: WallSetup;
  layout: WallLayout;
  showId: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
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

  const [layout, setLayout] = useState<WallLayout>(initialLayout);
  useEffect(() => setLayout(initialLayout), [initialLayout]);
  const [, startSave] = useTransition();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState(false);

  // Before any arranging, every work hangs in a neat line in sandbox order. Once you start
  // arranging, works added later wait in a tray above the walls until you drag them on.
  const arranging = items.some((w) => layout[w.id]);
  const unplaced = useMemo(() => items.filter((w) => !layout[w.id]), [items, layout]);
  const hung = useMemo(() => (arranging ? [] : hangWorks(unplaced, setup)), [arranging, unplaced, setup]);
  const maxSaved = Math.max(-1, ...items.map((w) => layout[w.id]?.wall ?? -1));
  const wallCount = Math.max(setup.walls.length, hung.length, maxSaved + 1);
  // Extra "doesn't fit" walls are as wide as the widest real wall.
  const last = setup.walls.reduce((a, b) => (b.width > a.width ? b : a));
  const walls = Array.from({ length: wallCount }, (_, i) =>
    i < setup.walls.length
      ? { wall: setup.walls[i], overflow: false }
      : {
          wall: {
            ...last,
            name: `Doesn't fit yet ${i - setup.walls.length + 1}`,
          } as Wall,
          overflow: true,
        },
  );

  type Spot = {
    item: SandboxWork;
    x: number;
    y: number;
    width: number;
    height: number;
    known: boolean;
    placed: boolean;
  };
  const sized = (w: SandboxWork) => {
    const size = realSize(w);
    return { ...(size ?? UNKNOWN_SIZE), known: !!size };
  };
  const onWall: Spot[][] = walls.map(() => []);
  for (const w of items) {
    const s = layout[w.id];
    if (s)
      onWall[s.wall]?.push({
        item: w,
        x: s.x,
        y: s.y,
        ...sized(w),
        placed: true,
      });
  }
  hung.forEach((h, i) => h.placed.forEach((p) => onWall[i]?.push({ ...p, placed: false })));
  const tray: Spot[] = arranging ? unplaced.map((w) => ({ item: w, x: 0, y: 0, ...sized(w), placed: false })) : [];

  const widest = Math.max(...walls.map((h) => h.wall.width));
  const scale = Math.max(0.5, px / (widest + GUTTER)); // pixels per inch
  const noSize = items.filter((w) => !w.width || !w.height).length;
  const overflowCount = walls.reduce((n, h, i) => n + (h.overflow ? onWall[i].length : 0), 0);
  const placedCount = items.filter((w) => layout[w.id]).length;

  /**
   * Moves one work (null puts it back in the line-up). The first move also pins every work
   * that is still in the automatic line-up where it stands, so nothing else shifts while you collage.
   */
  function place(id: string, spot: WallSpot | null) {
    const next: WallLayout = { ...layout };
    onWall.forEach((spots, wi) => spots.forEach((p) => !p.placed && (next[p.item.id] = { wall: wi, x: p.x, y: p.y })));
    if (spot) next[id] = spot;
    else delete next[id];
    setLayout(next);
    startSave(() => saveSandboxLayout(showId, next));
  }

  function drop(e: React.PointerEvent, d: Drag, p: Spot) {
    const left = e.clientX - d.grabX;
    const top = e.clientY - d.grabY;
    // Find the wall under the pointer.
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.wall !== undefined) as HTMLElement | undefined;
    if (!target) return;
    const wi = Number(target.dataset.wall);
    const wall = walls[wi]?.wall;
    if (!wall) return;
    const rect = target.getBoundingClientRect();
    const x = Math.min(Math.max(0, (left - rect.left) / scale), Math.max(0, wall.width - p.width));
    const yTop = Math.min(Math.max(0, (top - rect.top) / scale), Math.max(0, wall.height - p.height));
    place(p.item.id, { wall: wi, x, y: wall.height - yTop - p.height });
  }

  function renderWork(p: Spot, at: { left: number; top: number } | null, onWallNow: boolean) {
    const w = p.item;
    const isSel = selected.has(w.id);
    const d = drag?.id === w.id ? drag : null;
    return (
      <div
        key={w.id}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            id: w.id,
            startX: e.clientX,
            startY: e.clientY,
            dx: 0,
            dy: 0,
            grabX: e.clientX - r.left,
            grabY: e.clientY - r.top,
            moved: false,
          });
        }}
        onPointerMove={(e) => {
          if (!d) return;
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;
          setDrag({
            ...d,
            dx,
            dy,
            moved: d.moved || Math.abs(dx) + Math.abs(dy) > 4,
          });
        }}
        onPointerUp={(e) => {
          if (!d) return;
          setDrag(null);
          if (d.moved) drop(e, d, p);
          else onToggle(w.id);
        }}
        onPointerCancel={() => setDrag(null)}
        title={
          d
            ? undefined
            : `${w.artistName}, ${w.title}\n${formatSize(w)} · ${formatPrice(w.price)}${onWallNow ? `\nCentre ${feetInches(p.y + p.height / 2)} from the floor` : "\nDrag it onto a wall"}${p.known ? "" : "\nNo size given: shown as a 12″ square"}`
        }
        className={`group ${at ? "absolute" : "relative shrink-0"} cursor-grab touch-none select-none overflow-hidden bg-[#efebe4] active:cursor-grabbing ${
          d?.moved ? "z-20 opacity-80 shadow-[4px_8px_16px_rgba(0,0,0,0.3)]" : "z-10 shadow-[2px_3px_6px_rgba(0,0,0,0.18)]"
        } ${p.known ? "" : "outline-dashed outline-2 outline-amber-500"} ${isSel ? "ring-2 ring-ink ring-offset-2" : ""}`}
        style={{
          ...(at ?? {}),
          width: p.width * scale,
          height: p.height * scale,
          transform: d ? `translate(${d.dx}px, ${d.dy}px)` : undefined,
        }}
      >
        {w.image?.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.image.thumb} alt={w.title} draggable={false} className="pointer-events-none h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center p-0.5 text-center text-[9px] leading-tight text-muted">{w.title}</span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white group-hover:block">
          {w.title} · {p.known ? `${feetInches(p.height)} × ${feetInches(p.width)}` : "no size"}
        </span>
      </div>
    );
  }

  return (
    <div ref={box}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {setup.walls.length} wall{setup.walls.length === 1 ? "" : "s"} · works start in a line at {feetInches(setup.center)} to centre
        </span>
        {noSize > 0 && <span className="text-amber-800">{noSize} without a size, shown as dashed 12″ squares</span>}
        {overflowCount > 0 && <span className="text-red-700">{overflowCount} not on a real wall yet</span>}
        <div className="ml-auto flex gap-2">
          {placedCount > 0 && (
            <button
              onClick={() => {
                if (!confirm("Put every work back in a neat line? Your arrangement will be cleared.")) return;
                setLayout({});
                startSave(() => saveSandboxLayout(showId, null));
              }}
              className="rounded-md bg-white px-2.5 py-1 text-sm text-ink ring-1 ring-line hover:bg-paper"
            >
              Line them up again
            </button>
          )}
          <button onClick={() => setEditing((v) => !v)} className="rounded-md bg-white px-2.5 py-1 text-sm text-ink ring-1 ring-line hover:bg-paper">
            {editing ? "Close" : "Edit walls"}
          </button>
        </div>
      </div>
      {!setup.measured && !editing && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          These walls are a placeholder (20′ wide, 8′ high). Click <b>Edit walls</b> and type in the real measurements so the sizes are true.
        </p>
      )}
      {editing && <WallEditor setup={setup} onDone={() => setEditing(false)} />}
      {tray.length > 0 && (
        <div className="mb-6 rounded-lg bg-white/70 p-3 ring-1 ring-line">
          <p className="mb-2 text-xs text-muted">
            {tray.length} work{tray.length === 1 ? "" : "s"} waiting to go on a wall (shown to scale). Drag {tray.length === 1 ? "it" : "them"} onto a wall.
          </p>
          <div className="flex flex-wrap items-end gap-3">{tray.map((p) => renderWork(p, null, false))}</div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
        {walls.map((h, i) => {
          const W = h.wall.width * scale;
          const H = h.wall.height * scale;
          const g = GUTTER * scale;
          const spots = onWall[i];
          return (
            <figure key={i} style={{ width: GUTTER * scale + h.wall.width * scale }}>
              <figcaption className="mb-1 flex min-h-10 flex-wrap items-baseline gap-x-2 text-sm leading-tight">
                <span className={`font-medium ${h.overflow ? "text-red-700" : ""}`}>{h.wall.name}</span>
                <span className="text-xs text-muted">
                  {feetInches(h.wall.width)} × {feetInches(h.wall.height)} · {spots.length} work{spots.length === 1 ? "" : "s"}
                </span>
              </figcaption>
              <div className="relative" style={{ width: g + W, height: H + 22 }}>
                <Person height={PERSON * scale} left={g / 2} bottom={22} />
                <div
                  data-wall={i}
                  className={`absolute top-0 ${h.overflow ? "bg-red-50/60 outline-dashed outline-1 outline-red-300" : "bg-[#fbfaf7] shadow-[inset_0_-3px_0_#cfc7b8] ring-1 ring-[#e2dccf]"}`}
                  style={{ left: g, width: W, height: H }}
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t border-dotted border-[#d6cfc2]"
                    style={{ top: (h.wall.height - setup.center) * scale }}
                  />
                  {spots.map((p) =>
                    renderWork(
                      p,
                      {
                        left: p.x * scale,
                        top: (h.wall.height - p.y - p.height) * scale,
                      },
                      true,
                    ),
                  )}
                </div>
                <Ruler left={g} width={h.wall.width} scale={scale} top={H} />
              </div>
            </figure>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">
        Works start in a line in sandbox order. Drag any work anywhere on any wall, floor to ceiling, and everything stays where you leave it; works you add
        after that wait above the walls until you drag them on. “Line them up again” starts over. Hover for its title, size and height of its centre. Where a
        photo is clearly landscape but the size reads portrait (or the other way round), the photo wins.
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
    <svg viewBox="0 0 28 100" className="absolute text-[#cbc3b4]" style={{ height, width: w, left: left - w / 2, bottom }} aria-label="Person, 5′6″, for scale">
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
  return {
    ft: String(ft),
    inch: String(Math.round((inches - ft * 12) * 10) / 10),
  };
}

function WallEditor({ setup, onDone }: { setup: WallSetup; onDone: () => void }) {
  type Row = {
    name: string;
    wFt: string;
    wIn: string;
    hFt: string;
    hIn: string;
  };
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
          .map((r, i) => ({
            name: r.name.trim() || `Wall ${i + 1}`,
            width: n(r.wFt) * 12 + n(r.wIn),
            height: n(r.hFt) * 12 + n(r.hIn),
          }))
          .filter((w) => w.width > 0 && w.height > 0);
        if (!walls.length) return;
        start(async () => {
          await saveWallSetup({
            walls,
            gap: n(gap),
            center: n(center),
            measured: true,
          });
          onDone();
        });
      }}
    >
      <p className="mb-2 text-muted">Measure each wall you hang on, in the order you want works to go. Feet and inches both work.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => set(i, "name", e.target.value)}
              placeholder={`Wall ${i + 1}`}
              className="w-40 rounded-md px-2 py-1 ring-1 ring-line"
              aria-label="Wall name"
            />
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
              <button
                type="button"
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                className="ml-1 text-muted hover:text-ink"
                aria-label="Remove wall"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setRows((r) => [
            ...r,
            {
              name: `Wall ${r.length + 1}`,
              wFt: "10",
              wIn: "0",
              hFt: "10",
              hIn: "0",
            },
          ])
        }
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
