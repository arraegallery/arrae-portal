// A second daily run of the schedule emails (Vercel needs a separate path per cron entry).
export { GET } from "../schedule/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
