"use client";

import type { BoardImage } from "@/lib/queries";

/** Shows the work's image, or a quiet placeholder of the right shape while images are still being copied over. */
export function ArtworkImage({
  image,
  title,
  fallbackRatio,
  size = "thumb",
  className = "",
}: {
  image?: BoardImage;
  title: string;
  fallbackRatio?: number | null;
  size?: "thumb" | "full";
  className?: string;
}) {
  const src = size === "full" ? (image?.full ?? image?.thumb) : (image?.thumb ?? image?.full);
  const ratio = image?.w && image?.h ? image.w / image.h : fallbackRatio || 0.8;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={title} loading="lazy" className={`block h-auto w-full ${className}`} style={{ aspectRatio: ratio }} />;
  }
  return (
    <div
      className={`flex w-full min-w-24 items-center justify-center bg-[repeating-linear-gradient(45deg,#efebe4,#efebe4_10px,#f5f2ec_10px,#f5f2ec_20px)] p-3 text-center ${size === "full" ? "max-h-[85vh] w-[min(60vw,900px)]" : ""}`}
      style={{ aspectRatio: ratio }}
    >
      <span className="font-display text-sm text-muted">{title}</span>
    </div>
  );
}

export function formatSize(w: { width: number | null; height: number | null; depth: number | null; unit: string; sizeAsEntered: string | null }) {
  if (w.width && w.height) {
    const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, ""));
    return `${n(w.height)} × ${n(w.width)}${w.depth ? ` × ${n(w.depth)}` : ""} ${w.unit}`;
  }
  return w.sizeAsEntered || "Size not given";
}

export function formatPrice(p: number | null) {
  return p === null ? "No price" : `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
