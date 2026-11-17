import { personalize, type EmailContent } from "./email";

/**
 * The welcome emails sent after a show is finalized: one for returning (roster) artists and one for
 * first-time artists. Each is personalized with the artist's selected works, the drop-off dates and
 * the hanging requirements. Safe to import from client code (used for the live preview).
 */
export type WelcomeGroup = "returning" | "new";
export type WelcomeTemplate = { subject: string; heading: string; intro: string; closing: string; buttonLabel: string };
export type WelcomeTemplates = { returning: WelcomeTemplate; new: WelcomeTemplate; requirements: string };

export type WelcomeShow = { id: string; name: string; opens: string; closes: string };
export type WelcomeArtist = { id: string; name: string; email: string; group: WelcomeGroup; works: string[]; agreementSigned: boolean; sentAt: string | null };
export type WelcomeDropoff = { when: string; location: string | null } | null;

export const DEFAULT_TEMPLATES: WelcomeTemplates = {
  returning: {
    subject: "Welcome back: you're in {show}",
    heading: "Welcome back to ARRAE",
    intro:
      "Hi {first_name},\n\nWe're so happy to share that your work has been selected for ARRAE {show}! Having you back with us for another Volume means so much, and we can't wait to see your pieces on our walls again.\n\n{show} opens {opens} and is on view through {closes}.",
    closing:
      "If none of the drop-off times work for you, just reply to this email and we'll find another time together.\n\nThank you for being part of the ARRAE family. See you soon!\n\nWarmly,\nAnai and the ARRAE team",
    buttonLabel: "Pick my drop-off time",
  },
  new: {
    subject: "Welcome to ARRAE: you're in {show}",
    heading: "Welcome to ARRAE",
    intro:
      "Hi {first_name},\n\nCongratulations! We're thrilled to tell you that your work has been selected for ARRAE {show}, opening {opens} and on view through {closes}. We loved what you shared with us, and we're so excited to welcome you into the ARRAE artist community.\n\nTo get started, click the button below and sign in with the email address you applied with. We'll email you a sign-in link, plus a 6-digit code in case the link doesn't open.",
    closing:
      "Your studio is also where you can see your works, update your prices and message us any time. If you have any questions, just reply to this email. We're here to help.\n\nWelcome to ARRAE!\n\nWarmly,\nAnai and the ARRAE team",
    buttonLabel: "Sign in and pick my drop-off time",
  },
  requirements:
    "• Framed, or otherwise finished and ready to hang\n• Mounting hardware attached\n• Certificate of Authenticity securely attached to the back\n\nWe can't hold any packaging, so please plan to take it with you.",
};

export function readTemplates(raw: unknown): WelcomeTemplates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<WelcomeTemplates>;
  const one = (g: WelcomeGroup): WelcomeTemplate => ({ ...DEFAULT_TEMPLATES[g], ...(r[g] && typeof r[g] === "object" ? r[g] : {}) });
  return { returning: one("returning"), new: one("new"), requirements: typeof r.requirements === "string" ? r.requirements : DEFAULT_TEMPLATES.requirements };
}

const fill = (text: string, show: WelcomeShow, name: string) =>
  personalize(text, name).replace(/\{\s*show\s*\}/gi, show.name).replace(/\{\s*opens\s*\}/gi, show.opens).replace(/\{\s*closes\s*\}/gi, show.closes);

/** The finished email for one artist. */
export function buildWelcome(t: WelcomeTemplate, requirements: string, show: WelcomeShow, artist: Pick<WelcomeArtist, "name" | "works" | "agreementSigned">, dropoff: WelcomeDropoff, studioUrl: string): EmailContent {
  const works = artist.works.length ? artist.works.map((w) => `• ${w}`).join("\n") : "• (no works listed)";
  const parts = [
    fill(t.intro, show, artist.name),
    `Your work${artist.works.length === 1 ? "" : "s"} in ${show.name}:\n${works}`,
    dropoff
      ? `Drop-off is ${dropoff.when}${dropoff.location ? `, at ${dropoff.location}` : ""}. Click the button below to sign in to your artist studio and pick the time that works best for you. You'll get a confirmation email as soon as you book, and you can change your time from the same page.`
      : "Click the button below to sign in to your artist studio. We'll share the drop-off times there.",
    artist.agreementSigned
      ? ""
      : "Before you pick a time, you'll be asked to sign the ARRAE Artist Partnership Agreement in the portal. Every exhibiting artist signs it there, even if you signed a copy with us before. It only takes a few minutes, and the drop-off calendar opens as soon as it's done.",
    requirements.trim() ? `Please bring each work ready to hang:\n${requirements.trim()}` : "",
    fill(t.closing, show, artist.name),
  ].filter((p) => p.trim());
  return {
    subject: fill(t.subject, show, artist.name),
    heading: fill(t.heading, show, artist.name),
    body: parts.join("\n\n"),
    buttonLabel: t.buttonLabel.trim() || "Pick my drop-off time",
    buttonUrl: studioUrl,
  };
}
