import { createHmac, timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "./notify";

/**
 * Unsubscribe links for ARRAE's announcements and reminders. Each link carries a
 * signature of the address, so nobody can unsubscribe someone else by editing the URL.
 * Account emails (sign-in links, messages, agreements, decisions) are not affected.
 */
const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "arrae-dev-unsubscribe";
const norm = (email: string) => email.trim().toLowerCase();

export const unsubscribeToken = (email: string) => createHmac("sha256", secret()).update(norm(email)).digest("base64url").slice(0, 24);

export function validUnsubscribe(email: string, token: string) {
  const want = Buffer.from(unsubscribeToken(email));
  const got = Buffer.from(token ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

export const unsubscribeUrl = (email: string) => portalUrl(`/unsubscribe?e=${encodeURIComponent(norm(email))}&t=${unsubscribeToken(email)}`);

/** The one-click address mail apps call when someone presses their own "Unsubscribe" button. */
export const oneClickUrl = (email: string) => portalUrl(`/api/unsubscribe?e=${encodeURIComponent(norm(email))}&t=${unsubscribeToken(email)}`);

export async function optOut(email: string, source: string) {
  await db.insert(s.emailOptOuts).values({ email: norm(email), source }).onConflictDoNothing();
}

/** Which of these addresses have unsubscribed. */
export async function optedOut(emails: string[]): Promise<Set<string>> {
  const list = [...new Set(emails.map(norm))].filter(Boolean);
  if (!list.length) return new Set();
  const rows = await db.select({ email: s.emailOptOuts.email }).from(s.emailOptOuts).where(inArray(s.emailOptOuts.email, list));
  return new Set(rows.map((r) => r.email));
}
