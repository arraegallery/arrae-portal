"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteHours } from "../actions";

export function DeleteLog({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => confirm("Delete this entry?") && start(async () => (await deleteHours(id), router.refresh()))}
      className="text-xs text-rose-700 underline disabled:opacity-40"
    >
      Delete
    </button>
  );
}
