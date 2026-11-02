"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string; hint?: string; badge?: number; divider?: boolean };

const Badge = ({ n, tone = "ink" }: { n: number; tone?: "ink" | "red" }) =>
  n > 0 ? <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${tone === "red" ? "bg-red-600" : "bg-ink"}`}>{n}</span> : null;

/** One dropdown in the admin bar. Closes on a pick, an outside click, Escape, or navigation. */
export function NavMenu({ label, items, badge = 0, tone }: { label: string; items: NavItem[]; badge?: number; tone?: "ink" | "red" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
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
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`rounded-md px-2 py-1 hover:bg-white ${active ? "bg-white ring-1 ring-line" : ""}`}>
        {label}
        <Badge n={badge} tone={tone} /> <span className="text-[10px] text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-lg">
          {items.map((i) => (
            <div key={i.href + i.label}>
              {i.divider && <div className="my-1 border-t border-line" />}
              <Link href={i.href} onClick={() => setOpen(false)} className={`flex items-baseline gap-2 rounded px-2 py-1.5 hover:bg-paper ${pathname === i.href ? "bg-paper" : ""}`}>
                <span>{i.label}</span>
                {i.hint && <span className="text-xs text-muted">{i.hint}</span>}
                {!!i.badge && <span className="ml-auto"><Badge n={i.badge} tone={tone} /></span>}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A plain top-level link styled like the menus. */
export function NavTop({ href, children, badge = 0, tone }: { href: string; children: React.ReactNode; badge?: number; tone?: "ink" | "red" }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={`rounded-md px-2 py-1 hover:bg-white ${active ? "bg-white ring-1 ring-line" : ""}`}>
      {children}
      <Badge n={badge} tone={tone} />
    </Link>
  );
}
