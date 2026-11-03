import { NextResponse } from "next/server";
import { runScheduleJobs } from "@/lib/schedule-mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The schedule's emails (see vercel.json, which runs this a few times a day): the monthly
 * schedule on the 1st, the week ahead on Sundays, and "log your hours" after each shift.
 * Every email is recorded, so running it more often never sends anything twice.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runScheduleJobs());
}
