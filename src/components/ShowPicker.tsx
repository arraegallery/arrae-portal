"use client";

import { useRouter } from "next/navigation";

/** Switches between shows of one kind (Volumes or Takeovers) on the review board. */
export function ShowPicker({ current, shows, base = "/admin/review" }: { current: string; shows: { id: string; name: string }[]; base?: string }) {
  const router = useRouter();
  if (shows.length < 2) return null;
  return (
    <select
      value={current}
      onChange={(e) => router.push(`${base}/${e.target.value}`)}
      aria-label="Choose a show"
      className="max-w-72 rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-line"
    >
      {shows.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
