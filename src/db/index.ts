import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// prepare: false keeps this compatible with Supabase's transaction pooler.
// Short idle and lifetime limits retire sockets before a frozen Vercel function
// can reuse a dead one, and connect_timeout fails fast instead of hanging.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ??
  postgres(url, {
    prepare: false,
    max: 1,
    ...({ max_pipeline: 1 } as object), // supported at runtime, missing from the types
    idle_timeout: 5,
    max_lifetime: 60,
    connect_timeout: 10,
  });
globalForDb.pg = client;

// One query at a time, each sent only after the previous one has answered.
// Live timing (/admin/health) showed queries issued one after another answer in
// 5-40ms on Vercel, while queries handed to postgres-js all at once never
// answered, even on a single connection. So every query drizzle sends goes
// through this gate, with a time limit so a stuck one can't block the rest.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => PromiseLike<T>): Promise<T> {
  const result = tail.then(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      Promise.resolve(run()).finally(() => clearTimeout(timer)),
      new Promise<never>((_, no) => {
        timer = setTimeout(() => no(new Error("The database didn't answer within 20 seconds")), 20_000);
      }),
    ]);
  });
  tail = result.catch(() => undefined);
  return result;
}

type Unsafe = typeof client.unsafe;
const gated = new Proxy(client, {
  get(target, prop, receiver) {
    // A transaction holds the connection until it ends, so it takes its turn in the
    // gate as a whole; the queries inside it run one after another on their own.
    if (prop === "begin") return (...args: Parameters<typeof client.begin>) => serial(() => target.begin(...args));
    if (prop !== "unsafe") return Reflect.get(target, prop, receiver);
    return (...args: Parameters<Unsafe>) => {
      // drizzle either awaits the query or calls .values() on it, then awaits.
      const make = () => target.unsafe(...args);
      return {
        values: () => serial(() => make().values()),
        then: <A, B>(ok?: (v: Awaited<ReturnType<Unsafe>>) => A, bad?: (e: unknown) => B) => serial(() => make()).then(ok, bad),
      };
    };
  },
});

export const db = drizzle(gated, { schema });
export { schema };
