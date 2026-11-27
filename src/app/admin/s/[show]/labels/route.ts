import { buildShowLabels, LABEL_COLUMNS, LABEL_WIDTHS } from "@/lib/labels";
import { requireOwner } from "@/lib/team";
import { buildXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "<Show> Labels.xlsx": one row per artwork, ready to import into the Niimbot label app. */
export async function GET(_req: Request, { params }: { params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show } = await params;
  const labels = await buildShowLabels(show);
  if (!labels) return new Response("Show not found", { status: 404 });
  const file = buildXlsx(
    "Labels",
    [...LABEL_COLUMNS],
    labels.rows.map((r) => LABEL_COLUMNS.map((c) => r[c])),
    LABEL_WIDTHS,
  );
  const name = `${labels.showName.replace(/[\\/:*?"<>|]+/g, "-")} Labels.xlsx`;
  return new Response(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
