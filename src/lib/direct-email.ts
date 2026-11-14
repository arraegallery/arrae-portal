/**
 * Emails sent to one artist from the review page are kept in the activity log as
 * "Emailed “Subject” to name@x.com" followed by the message, so they read well anywhere
 * the history is shown and can be split back apart for the email log.
 */
export const DIRECT_EMAIL_KIND = "direct-email";

export function directEmailBody(subject: string, message: string, to: string) {
  return `Emailed “${subject}” to ${to}\n\n${message}`;
}

export function parseDirectEmail(body: string) {
  const m = body.match(/^Emailed “([\s\S]*?)” to (\S+)\n\n([\s\S]*)$/);
  return m ? { subject: m[1], to: m[2], message: m[3] } : { subject: "", to: "", message: body };
}
