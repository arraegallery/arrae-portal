import { asc, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { adminEmails } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { requireOwner } from "@/lib/team";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  await requireOwner();
  const members = await db.select().from(s.teamMembers).orderBy(asc(s.teamMembers.createdAt));
  // When each person last signed in (Supabase keeps this in auth.users).
  const lastSeen = new Map<string, string>();
  try {
    const rows = await db.execute<{ email: string; at: string }>(
      sql`select lower(email) as email, max(last_sign_in_at)::text as at from auth.users where last_sign_in_at is not null group by 1`,
    );
    for (const r of rows) lastSeen.set(r.email, new Date(r.at).toISOString());
  } catch {
    // No auth schema (local dev): show "Never signed in".
  }
  return (
    <TeamManager
      owners={adminEmails()}
      configured={emailConfigured()}
      members={members.map((m) => ({ email: m.email, name: m.name, addedBy: m.addedBy, since: m.createdAt.toISOString(), revoked: !!m.revokedAt, lastSeen: lastSeen.get(m.email.toLowerCase()) ?? null }))}
    />
  );
}
