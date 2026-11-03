/**
 * Reads a price or a size the way people type it: "$1,200", "660 USD", 24", "24 in", "1/2",
 * "24 1/2", "24-1/2", "24½", "60 cm". Returns NaN when it can't make sense of it.
 * Safe to use in the browser and on the server.
 */
const FRACTIONS: Record<string, string> = { "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8" };

export function parseAmount(raw: string): number {
  let t = raw.toLowerCase();
  for (const [k, v] of Object.entries(FRACTIONS)) t = t.split(k).join(v);
  t = t
    .replace(/[$,]/g, "")
    .replace(/usd|dollars?|inches|inch|in\.?|cm|centimeters?|["'“”″′]/g, " ")
    .replace(/⁄/g, "/")
    .trim();
  if (!t) return NaN;
  // "24 1/2" or "24-1/2"
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:-|\s)\s*(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : NaN;
  // "1/2"
  m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN;
  return /^\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}
