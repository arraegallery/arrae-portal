import { eq, inArray, like } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "@/lib/notify";

/**
 * Invite links: a private link ARRAE sends so someone can apply to a show after its open
 * call has closed. Stored in app_settings (no new table), as
 *   apply_invite:<token>      -> { showId, label, createdAt, createdBy, offAt, uses }
 *   apply_invite_for:<email>  -> <token>   (remembered once the artist gives their email,
 *                                           so the sign-in email round trip keeps the invite)
 * A link works for anyone who has it, as many times as needed, until it is turned off.
 */
export type Invite = {
  token: string;
  showId: string;
  label: string;
  createdAt: string;
  createdBy: string;
  offAt: string | null;
  uses: number;
};

const KEY = "apply_invite:";
const FOR = "apply_invite_for:";
const TOKEN = /^[A-Za-z0-9]{16,40}$/;

export const inviteUrl = (token: string) => portalUrl(`/apply?invite=${token}`);
const newToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

function parse(token: string, value: string): Invite | null {
  try {
    const v = JSON.parse(value);
    if (!v || typeof v.showId !== "string") return null;
    return { token, showId: v.showId, label: String(v.label ?? ""), createdAt: String(v.createdAt ?? ""), createdBy: String(v.createdBy ?? ""), offAt: v.offAt ?? null, uses: Number(v.uses) || 0 };
  } catch {
    return null;
  }
}

async function save(invite: Invite) {
  const { token, ...rest } = invite;
  const value = JSON.stringify(rest);
  await db.insert(s.appSettings).values({ key: KEY + token, value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
}

export async function getInvite(token: string | null | undefined): Promise<Invite | null> {
  if (!token || !TOKEN.test(token)) return null;
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, KEY + token));
  return row ? parse(token, row.value) : null;
}

/** The invite's show, if the link is still on. */
export async function liveInvite(token: string | null | undefined) {
  const invite = await getInvite(token);
  if (!invite || invite.offAt) return null;
  const [show] = await db.select({ id: s.shows.id, name: s.shows.name, description: s.shows.description, deadline: s.shows.applicationDeadline }).from(s.shows).where(eq(s.shows.id, invite.showId));
  return show ? { invite, show } : null;
}

export async function listInvites(showIds?: string[]): Promise<Invite[]> {
  const rows = await db.select().from(s.appSettings).where(like(s.appSettings.key, `${KEY}%`));
  return rows
    .map((r) => parse(r.key.slice(KEY.length), r.value))
    .filter((x): x is Invite => !!x && (!showIds || showIds.includes(x.showId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createInvite(showId: string, label: string, actor: string) {
  const invite: Invite = { token: newToken(), showId, label: label.trim().slice(0, 120), createdAt: new Date().toISOString(), createdBy: actor, offAt: null, uses: 0 };
  await save(invite);
  return invite;
}

export async function setInviteOff(token: string, off: boolean) {
  const invite = await getInvite(token);
  if (!invite) throw new Error("That link doesn't exist any more");
  invite.offAt = off ? new Date().toISOString() : null;
  await save(invite);
  return invite;
}

/** Remember which invite this email arrived with. */
export async function rememberInvite(email: string, token: string) {
  const key = FOR + email.toLowerCase();
  await db.insert(s.appSettings).values({ key, value: token }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: token } });
}

/** The live invite this email arrived with, if any. */
export async function inviteForEmail(email: string) {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, FOR + email.toLowerCase()));
  return row ? liveInvite(row.value) : null;
}

/** After a successful application: count it, and forget the email's invite. */
export async function inviteUsed(email: string, token: string) {
  const invite = await getInvite(token);
  if (invite) await save({ ...invite, uses: invite.uses + 1 });
  await db.delete(s.appSettings).where(inArray(s.appSettings.key, [FOR + email.toLowerCase()]));
}
