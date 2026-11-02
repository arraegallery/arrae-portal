"use client";

import { DocumentCenter } from "@/components/DocumentCenter";
import type { DocRow } from "@/lib/document-kinds";
import { addMyDocument, prepareMyDocument, removeMyDocument } from "./actions";

export function StudioDocuments({ initial }: { initial: DocRow[] }) {
  return <DocumentCenter mode="artist" initial={initial} actions={{ prepare: prepareMyDocument, add: (i) => addMyDocument(i), remove: removeMyDocument }} />;
}
