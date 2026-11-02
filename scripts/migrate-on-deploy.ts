/**
 * Runs before `next build`. On Vercel production builds, apply any new migrations so
 * schema changes ship with the code. Preview builds and local builds skip it, because
 * every environment shares one database.
 */
if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping migrations (not a production deploy)");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
await import("./migrate");
export {};
