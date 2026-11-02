/** Shared helpers for scripts that talk to Supabase over HTTPS with the service role key. */
import { createClient } from "@supabase/supabase-js";

export const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

export const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

export const chunk = <T,>(xs: T[], n = 200) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Fetch every row of a query, 1000 at a time (the API's page limit). */
export async function selectAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}
