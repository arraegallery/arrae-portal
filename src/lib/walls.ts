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

/**
 * Hangs works in order, one line per wall, centred at `center` inches, moving on to the next
 * wall when the next work won't fit. Works on a wall are spaced evenly across it. Anything that
 * doesn't fit on any wall goes on extra "overflow" walls the size of the last real one.
 */
export function hangWorks<T extends Sized>(items: T[], setup: WallSetup): HungWall<T>[] {
  const out: {
    wall: Wall;
    overflow: boolean;
    items: { item: T; width: number; height: number; known: boolean }[];
  }[] = [];
  const last = setup.walls[setup.walls.length - 1];
  let wi = 0;
  const wallAt = (i: number) =>
    i < setup.walls.length
      ? { wall: setup.walls[i], overflow: false }
      : {
          wall: {
            ...last,
            name: `Doesn't fit yet ${i - setup.walls.length + 1}`,
          },
          overflow: true,
        };
  let current = { ...wallAt(0), items: [] as (typeof out)[number]["items"] };
  out.push(current);
  const runWidth = (list: { width: number }[]) => list.reduce((s, x) => s + x.width, 0) + setup.gap * (list.length + 1);

  for (const item of items) {
    const size = realSize(item);
    const entry = { item, ...(size ?? UNKNOWN_SIZE), known: !!size };
    while (current.items.length && runWidth([...current.items, entry]) > current.wall.width) {
      wi++;
      current = { ...wallAt(wi), items: [] };
      out.push(current);
    }
    current.items.push(entry);
  }
  // Show every real wall, even empty ones, so the whole room is visible.
  while (wi < setup.walls.length - 1) {
    wi++;
    out.push({ ...wallAt(wi), items: [] });
  }

  return out.map(({ wall, overflow, items: list }) => {
    const used = list.reduce((s, x) => s + x.width, 0);
    const space = list.length ? Math.max(setup.gap, (wall.width - used) / (list.length + 1)) : 0;
    let x = space;
    const placed = list.map((p) => {
      const y = Math.max(0, Math.min(wall.height - p.height, setup.center - p.height / 2));
      const at = {
        item: p.item,
        x,
        y,
        width: p.width,
        height: p.height,
        known: p.known,
      };
      x += p.width + space;
      return at;
    });
    return {
      wall,
      overflow,
      placed,
      used,
      free: Math.max(0, wall.width - used),
    };
  });
}

/** Where a work was dragged to on the to-scale wall: wall index, and inches from the wall's left edge and from the floor to the work's bottom edge. */
export type WallSpot = { wall: number; x: number; y: number };
export type WallLayout = Record<string, WallSpot>;

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
      if ([wall, x, y].every(Number.isFinite) && wall >= 0 && wall < 60) out[id] = { wall: Math.floor(wall), x, y };
    }
    return out;
  } catch {
    return {};
  }
}
