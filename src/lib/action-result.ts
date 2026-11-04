/**
 * In production, Next.js hides the message of any error thrown from a server action
 * ("An error occurred in the Server Components render…"). For forms people outside ARRAE
 * fill in, return the message instead so they can see what to fix.
 * Redirects (sign-in) still pass through.
 */
export async function asResult<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"))) throw e;
    console.error(e);
    return { ok: false, error: e instanceof Error && e.message ? e.message : "Something went wrong. Please try again." };
  }
}
