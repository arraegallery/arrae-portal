import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getLogistics } from "@/lib/logistics";
import { portalUrl } from "@/lib/notify";
import { requireTeam } from "@/lib/team";
import { LogisticsBoard } from "./LogisticsBoard";

export const maxDuration = 60;

export default async function LogisticsPage() {
  const me = await requireTeam();
  const data = await getLogistics();
  const [token] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "calendar_token"));
  return <LogisticsBoard {...data} owner={me.role === "owner"} feedUrl={token ? portalUrl(`/api/calendar/${token.value}.ics`) : null} />;
}
