import { clock } from "@/lib/schedule";
import { hoursReport, hrs } from "@/lib/schedule-report";
import { requireOwner } from "@/lib/team";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** The hours report as a spreadsheet: a summary per person, then every logged entry. */
export async function GET(req: Request) {
  await requireOwner();
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Pick dates", { status: 400 });
  const rows = await hoursReport(from, to);
  const out: (string | number)[][] = [
    [`ARRAE Gallery Assistant hours, ${from} to ${to}`],
    [],
    ["Name", "Email", "Shifts worked", "Scheduled hours", "Logged hours", "Shifts not logged"],
    ...rows.map((r) => [r.name, r.email, r.shifts, hrs(r.scheduledMinutes), hrs(r.loggedMinutes), r.missing.length]),
    [],
    ["Name", "Date", "Start", "End", "Hours", "Scheduled shift?", "Note"],
    ...rows.flatMap((r) => r.logs.map((l) => [r.name, l.date, clock(l.startTime), clock(l.endTime), hrs(l.minutes), l.shiftId ? "Yes" : "No (extra)", l.note ?? ""])),
  ];
  const csv = out.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="arrae-hours-${from}-to-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
