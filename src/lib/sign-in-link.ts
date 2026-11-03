import { emailConfigured, renderEmail, renderText, sendEmails } from "./email";
import { supabaseAdmin, supabaseForRequest } from "./supabase/server";

/**
 * Emails a one-time sign-in link that works in any browser.
 *
 * Supabase's default link (signInWithOtp) uses PKCE, so it only works in the browser
 * that asked for it. People often open the email on their phone or inside their mail
 * app, the code can't be exchanged there, and they land back on the email form. Here
 * we mint the token with the admin API and send our own email pointing at
 * /auth/confirm, which verifies the token hash wherever it's opened.
 */
export async function sendSignInLink(email: string, origin: string, opts: { createUser?: boolean; purpose?: "apply" | "signin" } = {}) {
  if (!emailConfigured()) {
    // Local development without Resend: fall back to Supabase's own email.
    const supabase = await supabaseForRequest();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: !!opts.createUser } });
    if (error) throw error;
    return;
  }
  const admin = supabaseAdmin();
  if (opts.createUser) {
    // Fails harmlessly when the account already exists.
    await admin.auth.admin.createUser({ email, email_confirm: true });
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw error ?? new Error("Couldn't create a sign-in link");
  // Someone signing in for the first time (an artist imported without an account yet) gets
  // a "signup" token rather than a "magiclink" one, and it only verifies with its own type.
  const type = data.properties.verification_type || "magiclink";
  const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${encodeURIComponent(type)}`;
  const apply = opts.purpose === "apply";
  const content = {
    subject: apply ? "Continue your ARRAE application" : "Your ARRAE sign-in link",
    heading: apply ? "Continue your application" : "Your sign-in link",
    body: `${apply ? "Click the button below to continue your application to ARRAE Gallery." : "Click the button below to sign in to the ARRAE portal."} The link works once and expires in an hour. You can open it on any device.\n\nDidn't ask for this? You can ignore this email; nobody can sign in without the link.`,
    buttonLabel: apply ? "Continue my application" : "Sign in to ARRAE",
    buttonUrl: url,
  };
  const { failures } = await sendEmails([{ to: email, subject: content.subject, html: renderEmail(content), text: renderText(content) }]);
  if (failures.length) throw new Error(failures[0].error);
}
