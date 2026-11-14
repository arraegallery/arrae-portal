import type { ApplicationStatus } from "./status";

/**
 * Finalizing a show's sandbox makes every work in it Selected for that show. A first-time
 * (non-roster) artist has to be accepted for the show first, so their application must be
 * Selected. Safe to import from client code.
 */
export type FinalizeWork = {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string;
  artistKind: "roster" | "new";
  application: { id: string; status: ApplicationStatus } | null;
};

export type FinalizeConflict = {
  artistId: string;
  artistName: string;
  /** Their application to this show, or null if they never applied to it. */
  application: { id: string; status: ApplicationStatus } | null;
  works: { id: string; title: string }[];
};

export function finalizeConflicts(works: FinalizeWork[]): FinalizeConflict[] {
  const byArtist = new Map<string, FinalizeConflict>();
  for (const w of works) {
    if (!w.artistId || w.artistKind !== "new" || w.application?.status === "Selected") continue;
    const c = byArtist.get(w.artistId) ?? { artistId: w.artistId, artistName: w.artistName, application: w.application, works: [] };
    c.works.push({ id: w.id, title: w.title });
    byArtist.set(w.artistId, c);
  }
  return [...byArtist.values()].sort((a, b) => a.artistName.localeCompare(b.artistName));
}
