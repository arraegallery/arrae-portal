import { adminEmails } from "./auth";
import { EMAIL_REPLY_TO, emailConfigured, renderEmail, renderText, sendEmails } from "./email";

const PORTAL = process.env.PORTAL_URL || "https://arrae-portal.vercel.app";

/** Best-effort email nudge about a new portal message. Never throws: the message is already saved. */
export async function notifyNewMessage(opts: { to: "arrae" | string; artistName: string; preview: string; artistId?: string }) {
  if (!emailConfigured()) return;
  const toArrae = opts.to === "arrae";
  const recipients = toArrae ? [EMAIL_REPLY_TO, ...adminEmails()].filter((e, i, a) => e && a.indexOf(e) === i).slice(0, 3) : [opts.to];
  const preview = opts.preview.length > 400 ? `${opts.preview.slice(0, 400)}…` : opts.preview;
  const content = toArrae
    ? {
        subject: `New message from ${opts.artistName}`,
        heading: `${opts.artistName} wrote`,
        body: preview,
        buttonLabel: "Reply in the portal",
        buttonUrl: `${PORTAL}/admin/artists/${encodeURIComponent(opts.artistId ?? "")}#messages`,
      }
    : {
        subject: "You have a new message from ARRAE",
        heading: "A new message from ARRAE",
        body: `Hi ${opts.artistName.split(/\s+/)[0]},\n\n${preview}`,
        buttonLabel: "Read and reply",
        buttonUrl: `${PORTAL}/studio/messages`,
      };
  try {
    await sendEmails(recipients.map((to) => ({ to, subject: content.subject, html: renderEmail(content), text: renderText(content) })));
  } catch {
    // The message itself is stored; an email hiccup shouldn't fail the send.
  }
}
