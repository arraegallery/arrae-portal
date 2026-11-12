/**
 * The gallery's walls, for the to-scale view in the sandbox. Everything is in inches.
 * Stored as JSON in app_settings under WALLS_KEY. Safe to import from client code.
 */

export const WALLS_KEY = "gallery_walls";

export type Wall = { name: string; width: number; height: number };
export type WallSetup = {
  walls: Wall[];
  /** Smallest space between two works on the same wall. */
  gap: number;
  /** Height of the centre of each work above the floor (57" is the usual gallery rule). */
  center: number;
  /** False until someone has entered the real measurements. */
  measured: boolean;
};

export const DEFAULT_WALLS: WallSetup = {
  walls: [{ name: "Wall 1", width: 240, height: 96 }],
  gap: 4,
  center: 57,
  measured: false,
};

const num = (x: unknown, min: number, max: number, fallback: number) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Reads a stored setup, falling back to the defaults for anything missing or odd. */
export function parseWallSetup(raw: string | null | undefined): WallSetup {
  if (!raw) return DEFAULT_WALLS;
  try {
    const v = JSON.parse(raw) as Partial<WallSetup>;
    const walls = (Array.isArray(v.walls) ? v.walls : []).slice(0, 30).map((w, i) => ({
      name: String(w?.name ?? "").slice(0, 60) || `Wall ${i + 1}`,
      width: num(w?.width, 12, 2400, 240),
      height: num(w?.height, 12, 600, 96),
    }));
    return {
      walls: walls.length ? walls : DEFAULT_WALLS.walls,
      gap: num(v.gap, 0, 60, DEFAULT_WALLS.gap),
      center: num(v.center, 12, 120, DEFAULT_WALLS.center),
      measured: !!v.measured,
    };
  } catch {
    return DEFAULT_WALLS;
  }
}

/** 174 → 14′ 6″ */
export function feetInches(inches: number) {
  const total = Math.round(inches * 2) / 2;
  const ft = Math.floor(total / 12);
  const inch = total - ft * 12;
  if (!ft) return `${inch}″`;
  return inch ? `${ft}′ ${inch}″` : `${ft}′`;
}

type Sized = {
  width: number | null;
  height: number | null;
  unit: string;
  image?: { w: number | null; h: number | null } | null;
};

/**
 * A work's real width and height in inches, or null when no size was given. Artists often
 * type "9 x 12" for a landscape piece, so when the photo clearly disagrees with the parsed
 * orientation, trust the photo and swap the two numbers.
 */
export function realSize(w: Sized): { width: number; height: number } | null {
  if (!w.width || !w.height) return null;
  const k = w.unit === "cm" ? 1 / 2.54 : w.unit === "ft" ? 12 : 1;
  let width = w.width * k;
  let height = w.height * k;
  const iw = w.image?.w;
  const ih = w.image?.h;
  if (iw && ih && width !== height) {
    const photoLandscape = iw / ih > 1.08;
    const photoPortrait = ih / iw > 1.08;
    if ((photoLandscape && height > width) || (photoPortrait && width > height)) [width, height] = [height, width];
  }
  return { width, height };
}

/** Stand-in size for a work with no measurements, so it still shows on the wall. */
export const UNKNOWN_SIZE = { width: 12, height: 12 };

export type Placed<T> = {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
  known: boolean;
};
export type HungWall<T> = {
  wall: Wall;
  overflow: boolean;
  placed: Placed<T>[];
  used: number;
  free: number;
};

type Entry<T> = { item: T; width: number; height: number; known: boolean };
type Row<T> = { items: Entry<T>[]; width: number; height: number };

/** One row per wall, spaced evenly, centred at the hanging height. Null if the works don't all fit that way. */
function hangInLine<T>(entries: Entry<T>[], setup: WallSetup): Row<T>[][] | null {
  const walls: Row<T>[][] = setup.walls.map(() => []);
  let wi = 0;
  for (const e of entries) {
    while (wi < setup.walls.length) {
      const row = walls[wi][0];
      const need = (row ? row.width + e.width : e.width) + setup.gap * ((row?.items.length ?? 0) + 2);
      if (need <= setup.walls[wi].width && e.height + 2 * setup.gap <= setup.walls[wi].height) break;
      if (!row) return null; // too big for an empty wall
      wi++;
    }
    if (wi >= setup.walls.length) return null;
    if (!walls[wi][0]) walls[wi][0] = { items: [], width: 0, height: 0 };
    const row = walls[wi][0];
    row.items.push(e);
    row.width += e.width;
    row.height = Math.max(row.height, e.height);
  }
  return walls;
}

/** Salon style: rows stacked floor to ceiling, each work going on the emptiest wall with room. */
function hangInRows<T>(entries: Entry<T>[], setup: WallSetup): { walls: Row<T>[][]; leftover: Entry<T>[] } {
  const walls: Row<T>[][] = setup.walls.map(() => []);
  const leftover: Entry<T>[] = [];
  const g = setup.gap;
  const stackHeight = (rows: Row<T>[]) => rows.reduce((s, r) => s + r.height, 0) + g * (rows.length + 1);
  const filled = setup.walls.map(() => 0);
  // Where would this work go on wall wi? "row" = end of the last row, "new" = a new row, null = no room.
  const fit = (e: Entry<T>, wi: number): "row" | "new" | null => {
    const wall = setup.walls[wi];
    const rows = walls[wi];
    const row = rows[rows.length - 1];
    if (row && row.width + e.width + g * (row.items.length + 2) <= wall.width && stackHeight(rows) - row.height + Math.max(row.height, e.height) <= wall.height)
      return "row";
    if (e.width + 2 * g <= wall.width && stackHeight(rows) + e.height + g <= wall.height) return "new";
    return null;
  };
  for (const e of entries) {
    // Spread works out: use the emptiest wall (by share of its area covered) that has room.
    let best = -1;
    for (let wi = 0; wi < setup.walls.length; wi++) {
      if (!fit(e, wi)) continue;
      const share = filled[wi] / (setup.walls[wi].width * setup.walls[wi].height);
      if (best < 0 || share < filled[best] / (setup.walls[best].width * setup.walls[best].height)) best = wi;
    }
    const done = best >= 0;
    if (done) {
      const rows = walls[best];
      if (fit(e, best) === "row") {
        const row = rows[rows.length - 1];
        row.items.push(e);
        row.width += e.width;
        row.height = Math.max(row.height, e.height);
      } else rows.push({ items: [e], width: e.width, height: e.height });
      filled[best] += e.width * e.height;
    }
    if (!done) leftover.push(e);
  }
  return { walls, leftover };
}

/**
 * Hangs works on the real walls in sandbox order. If they all fit in one line at the hanging
 * height, they hang that way; otherwise they're packed in rows floor to ceiling (salon style).
 * Works that still don't fit come back in `leftover`. There are never any extra, made-up walls.
 */
export function hangWorks<T extends Sized>(items: T[], setup: WallSetup): { walls: HungWall<T>[]; leftover: T[] } {
  const entries: Entry<T>[] = items.map((item) => {
    const size = realSize(item);
    return { item, ...(size ?? UNKNOWN_SIZE), known: !!size };
  });
  const line = hangInLine(entries, setup);
  const { walls: rowsByWall, leftover } = line ? { walls: line, leftover: [] as Entry<T>[] } : hangInRows(entries, setup);

  const walls = setup.walls.map((wall, wi) => {
    const rows = rowsByWall[wi];
    const g = setup.gap;
    const block = rows.reduce((s, r) => s + r.height, 0) + g * Math.max(0, rows.length - 1);
    // Centre the block of rows on the hanging height, kept inside the wall.
    let top = Math.min(Math.max(g + block, setup.center + block / 2), wall.height - g); // inches from floor to the block's top
    if (rows.length === 1) top = Math.min(wall.height, setup.center + rows[0].height / 2);
    const placed: Placed<T>[] = [];
    for (const r of rows) {
      const space = Math.max(g, (wall.width - r.width) / (r.items.length + 1));
      let x = space;
      const mid = top - r.height / 2;
      for (const e of r.items) {
        const y = Math.max(0, Math.min(wall.height - e.height, mid - e.height / 2));
        placed.push({ item: e.item, x, y, width: e.width, height: e.height, known: e.known });
        x += e.width + space;
      }
      top -= r.height + g;
    }
    const used = rows.reduce((s, r) => s + r.width, 0);
    return { wall, overflow: false, placed, used, free: Math.max(0, wall.width - used) };
  });
  return { walls, leftover: leftover.map((e) => e.item) };
}

/** Where a work was dragged to on the to-scale wall: wall index, and inches from the wall's left edge and from the floor to the work's bottom edge. */
export type WallSpot = { wall: number; x: number; y: number };
export type WallLayout = Record<string, WallSpot>;

/** WallSpot.wall value for works standing on the floor or a pedestal instead of hanging. */
export const FLOOR = -1;
/** Categories that start on the floor rather than on a wall. */
export const FLOOR_CATEGORIES = ["Sculpture", "Ceramic"];
export const startsOnFloor = (w: { category?: string | null }) => !!w.category && FLOOR_CATEGORIES.includes(w.category);

export const layoutKey = (showId: string) => `sandbox_layout:${showId}`;

export function parseLayout(raw: string | null | undefined): WallLayout {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, Partial<WallSpot>>;
    const out: WallLayout = {};
    for (const [id, s] of Object.entries(v ?? {})) {
      const wall = Number(s?.wall);
      const x = Number(s?.x);
      const y = Number(s?.y);
      if ([wall, x, y].every(Number.isFinite) && (wall === FLOOR || (wall >= 0 && wall < 60))) out[id] = { wall: Math.floor(wall), x, y };
    }
    return out;
  } catch {
    return {};
  }
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Finds an empty spot for each work on walls that already have an arrangement, so works added
 * later show up on a wall instead of waiting off to the side. Tries spots closest to the hanging
 * height first, wall by wall, keeping `gap` inches clear of other works and the wall's edges.
 * Works with no free spot come back in `leftover`.
 */
export function fitIntoGaps<T extends Sized>(
  items: T[],
  setup: WallSetup,
  taken: Rect[][],
): { placed: (Placed<T> & { wall: number })[]; leftover: T[] } {
  const g = setup.gap;
  const occupied = setup.walls.map((_, i) => [...(taken[i] ?? [])]);
  const placed: (Placed<T> & { wall: number })[] = [];
  const leftover: T[] = [];
  const clear = (r: Rect, others: Rect[]) =>
    others.every((o) => r.x + r.width + g <= o.x || o.x + o.width + g <= r.x || r.y + r.height + g <= o.y || o.y + o.height + g <= r.y);
  for (const item of items) {
    const size = realSize(item);
    const { width, height } = size ?? UNKNOWN_SIZE;
    let found: (Rect & { wall: number }) | null = null;
    for (let wi = 0; wi < setup.walls.length && !found; wi++) {
      const wall = setup.walls[wi];
      if (width + 2 * g > wall.width || height + 2 * g > wall.height) continue;
      // Candidate bottoms, nearest to centring on the hanging height first.
      const ideal = Math.max(g, Math.min(wall.height - g - height, setup.center - height / 2));
      const ys: number[] = [];
      for (let y = g; y <= wall.height - g - height; y += 2) ys.push(y);
      ys.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
      for (const y of ys) {
        for (let x = g; x <= wall.width - g - width && !found; x += 2) {
          const r = { x, y, width, height };
          if (clear(r, occupied[wi])) found = { ...r, wall: wi };
        }
        if (found) break;
      }
    }
    if (found) {
      occupied[found.wall].push(found);
      placed.push({ item, x: found.x, y: found.y, width, height, known: !!size, wall: found.wall });
    } else leftover.push(item);
  }
  return { placed, leftover };
}
