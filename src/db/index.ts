import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// prepare: false keeps this compatible with Supabase's transaction pooler.
// On Vercel a warm function can be frozen between requests, which leaves pooled
// sockets dead without postgres-js noticing; a query sent on one then waits until
// the platform kills the request. Short idle and lifetime limits retire sockets
// before that happens, and connect_timeout fails fast instead of hanging.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ??
  postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 5,
    max_lifetime: 60,
    connect_timeout: 10,
  });
globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
