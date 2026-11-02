import { db, schema as s } from "@/db";

import { TRACKED_FIELDS, type TrackedField } from "./change-fields";
export { TRACKED_FIELDS, type TrackedField };

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v);
  return String(v);
};
// Prices come back from Postgres as "1250.00"; compare them as numbers.
const same = (field: string, a: string | null, b: string | null) =>
  field === "priceUsd" || field === "width" || field === "height" || field === "depth"
    ? (a === null ? null : Number(a)) === (b === null ? null : Number(b))
    : a === b;

/** Writes one change-log row per field that actually changed. Returns the fields that changed. */
export async function recordWorkChanges(opts: {
  workId: string;
  artistId: string | null;
  before: Partial<Record<TrackedField, unknown>>;
  after: Partial<Record<TrackedField, unknown>>;
  actor: string;
  role: "arrae" | "artist";
}) {
  const rows = (Object.keys(opts.after) as TrackedField[])
    .filter((f) => f in TRACKED_FIELDS)
    .map((f) => ({ field: f, oldValue: asText(opts.before[f]), newValue: asText(opts.after[f]) }))
    .filter((r) => !same(r.field, r.oldValue, r.newValue));
  if (rows.length)
    await db.insert(s.workChanges).values(rows.map((r) => ({ ...r, workId: opts.workId, artistId: opts.artistId, actor: opts.actor, actorRole: opts.role })));
  return rows.map((r) => r.field);
}
