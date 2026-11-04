/**
 * ARRAE's branded email layout (the same look as the sign-in email in
 * supabase/email/magic-link.html) and sending through Resend's HTTP API.
 */

export const EMAIL_FROM =
  process.env.EMAIL_FROM || "ARRAE Gallery <hello@arraegallery.com>";
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO || "hello@arraegallery.com";
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export type EmailContent = {
  subject: string;
  heading?: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Adds an unsubscribe line to the footer (announcements and reminders only). */
  unsubscribeUrl?: string;
};

const esc = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";

/** Escape the text, turn links into anchors, blank lines into paragraphs and single breaks into <br>. */
function paragraphs(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) =>
      esc(p.trim())
        .replace(
          /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
          '<a href="$1" style="color:#1f1d1a;">$1</a>',
        )
        .replace(/\n/g, "<br />"),
    )
    .map((p) => `<p style="margin:0 0 16px 0;">${p}</p>`)
    .join("");
}

/** Swap {name} and {first_name} for the artist's own name. */
export function personalize(text: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || name;
  return text
    .replace(/\{\s*first_name\s*\}/gi, first)
    .replace(/\{\s*name\s*\}/gi, name);
}

export function renderEmail(c: EmailContent) {
  const safeUrl =
    c.buttonUrl && /^https?:\/\//i.test(c.buttonUrl.trim())
      ? c.buttonUrl.trim()
      : "";
  const heading = c.heading?.trim()
    ? `<tr><td style="padding:24px 40px 0 40px;font-family:${SERIF};font-size:26px;line-height:1.25;color:#1f1d1a;">${esc(c.heading.trim())}</td></tr>`
    : "";
  const button =
    safeUrl && c.buttonLabel?.trim()
      ? `<tr><td style="padding:12px 40px 8px 40px;"><a href="${esc(safeUrl)}" style="display:inline-block;background:#1f1d1a;color:#ffffff;text-decoration:none;font-family:${SANS};font-size:15px;padding:12px 22px;border-radius:8px;">${esc(c.buttonLabel.trim())}</a></td></tr>`
      : "";
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#faf8f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e1d8;border-radius:12px;">
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <img src="https://arrae-portal.vercel.app/arrae-logo.png" alt="ARRAE" width="110" style="display:block;width:110px;height:auto;border:0;" />
              </td>
            </tr>
            ${heading}
            <tr>
              <td style="padding:16px 40px 8px 40px;font-family:${SANS};font-size:15px;line-height:1.6;color:#3d3a35;">
                ${paragraphs(c.body)}
              </td>
            </tr>
            ${button}
            <tr><td style="padding:0 0 32px 0;"></td></tr>
          </table>
          <p style="margin:20px 0 0 0;font-family:${SANS};font-size:12px;color:#6f6a62;">
            ARRAE Gallery · <a href="https://arraegallery.com" style="color:#6f6a62;">arraegallery.com</a>
          </p>${
            c.unsubscribeUrl
              ? `
          <p style="margin:8px 0 0 0;font-family:${SANS};font-size:12px;color:#6f6a62;">
            Don&rsquo;t want announcements like this? <a href="${esc(c.unsubscribeUrl)}" style="color:#6f6a62;">Unsubscribe</a>
          </p>`
              : ""
          }
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plain-text twin of the email, for clients that don't show HTML. */
export function renderText(c: EmailContent) {
  return [
    c.heading?.trim(),
    c.body.trim(),
    c.buttonLabel && c.buttonUrl ? `${c.buttonLabel}: ${c.buttonUrl}` : "",
    "ARRAE Gallery · arraegallery.com",
    c.unsubscribeUrl ? `Unsubscribe from announcements: ${c.unsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

type Outgoing = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The one-click unsubscribe address, so Gmail and Apple Mail show their own Unsubscribe button. */
  oneClickUnsubscribe?: string;
};

/**
 * Sends each message on its own (so nobody sees anyone else's address), 100 per
 * request through Resend's batch endpoint. Returns how many went out per chunk.
 */
export async function sendEmails(messages: Outgoing[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    throw new Error("Email isn't set up yet: add RESEND_API_KEY in Vercel");
  const failures: { to: string; error: string }[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((m) => ({
            from: EMAIL_FROM,
            reply_to: EMAIL_REPLY_TO,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            text: m.text,
            ...(m.oneClickUnsubscribe
              ? {
                  headers: {
                    "List-Unsubscribe": `<${m.oneClickUnsubscribe}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
                }
              : {}),
          })),
        ),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      for (const m of chunk)
        failures.push({
          to: m.to,
          error: `couldn't reach the email service (${(e as Error).message})`,
        });
      continue;
    }
    if (res.ok) sent += chunk.length;
    else {
      const detail = await res.text().catch(() => "");
      for (const m of chunk)
        failures.push({
          to: m.to,
          error: `${res.status} ${detail.slice(0, 200)}`,
        });
    }
  }
  return { sent, failures };
}
