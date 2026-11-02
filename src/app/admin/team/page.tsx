import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { adminEmails } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { requireOwner } from "@/lib/team";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  await requireOwner();
  const members = await db.select().from(s.teamMembers).orderBy(asc(s.teamMembers.createdAt));
  return (
    <TeamManager
      owners={adminEmails()}
      configured={emailConfigured()}
      members={members.map((m) => ({ email: m.email, name: m.name, addedBy: m.addedBy, since: m.createdAt.toISOString(), revoked: !!m.revokedAt }))}
    />
  );
}
