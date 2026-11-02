"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** "All shows" menu: closes on a pick, an outside click, Escape, or navigation. */
export function ShowsMenu({ shows }: { shows: { id: string; name: string; type: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-md px-2 py-1 hover:bg-white">
        All shows ▾
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-80 rounded-md border border-line bg-white p-1 shadow-lg">
          {shows.map((s) => (
            <Link key={s.id} href={`/admin/review/${s.id}`} onClick={() => setOpen(false)} className="block rounded px-2 py-1.5 hover:bg-paper">
              {s.name} <span className="text-xs text-muted">· {s.type}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
