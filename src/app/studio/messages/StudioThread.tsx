"use client";

import { Thread, type ThreadMessage } from "@/components/Thread";
import { sendStudioMessage } from "../actions";

export function StudioThread({ initial }: { initial: ThreadMessage[] }) {
  return <Thread initial={initial} me="artist" otherName="ARRAE" send={sendStudioMessage} placeholder="Write to ARRAE…" />;
}
