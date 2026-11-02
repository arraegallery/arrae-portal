"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { EVENT_KINDS } from "./kinds";

export type EventInput = {
  id?: string;
  title: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  showId: string;
};

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const time = (v: string) => (/^\d{2}:\d{2}$/.test(v.trim()) ? v.trim() : null);
const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);

export async function saveEvent(input: EventInput) {
  const actor = await requireOwner();
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("Give the event a name");
  if (!isDate(input.startsOn)) throw new Error("Pick a start date");
  const endsOn = isDate(input.endsOn) && input.endsOn > input.startsOn ? input.endsOn : null;
  const row = {
    title,
    kind: EVENT_KINDS.some((k) => k.id === input.kind) ? input.kind : "event",
    startsOn: input.startsOn,
    endsOn,
    startTime: time(input.startTime),
    endTime: time(input.endTime),
    location: input.location.trim().slice(0, 200) || null,
    notes: input.notes.trim().slice(0, 4000) || null,
    showId: input.showId || null,
  };
  if (input.id) await db.update(s.galleryEvents).set(row).where(eq(s.galleryEvents.id, input.id));
  else await db.insert(s.galleryEvents).values({ id: `evt_${rand()}`, createdBy: actor, ...row });
  revalidatePath("/admin/calendar");
}

export async function deleteEvent(id: string) {
  await requireOwner();
  await db.delete(s.galleryEvents).where(eq(s.galleryEvents.id, id));
  revalidatePath("/admin/calendar");
}
