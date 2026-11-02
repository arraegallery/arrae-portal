import { NextResponse } from "next/server";
import { getAgreementAuto } from "@/lib/agreement";
import { sendDueReminders } from "@/lib/agreement-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily job (see vercel.json): emails artists whose agreement is still unsigned, on the
 * schedule in REMINDER. Vercel sends "Authorization: Bearer <CRON_SECRET>"; without that
 * secret set, the job does nothing.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await getAgreementAuto()).reminders) return NextResponse.json({ skipped: "reminders are off" });
  return NextResponse.json(await sendDueReminders());
}
