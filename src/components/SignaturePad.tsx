"use client";

import { useEffect, useRef, useState } from "react";

/** Draw a signature with a finger, pen or mouse. Reports a PNG data URL (or null when empty). */
export function SignaturePad({ onChange, initial, height = 160 }: { onChange: (dataUrl: string | null) => void; initial?: string | null; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!initial);
  const inked = useRef(!!initial); // a ref, so pointer-up sees the stroke drawn in this same gesture

  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    c.width = c.offsetWidth * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#161616";
    if (initial) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(c.offsetWidth / img.width, height / img.height, 1);
        ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
      };
      img.src = initial;
    }
  }, [height, initial]);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    inked.current = true;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(inked.current ? trimmed(canvas.current!) : null);
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative rounded-md bg-white ring-1 ring-line">
        <canvas
          ref={canvas}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          aria-label="Signature box: draw your signature here"
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-line" />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">Sign here with your finger, pen or mouse</span>}
      </div>
      <button type="button" onClick={clear} className="mt-1 text-xs text-muted underline">
        Clear
      </button>
    </div>
  );
}

/** Crops the drawing to its ink so it sits neatly on the signature line. */
function trimmed(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d")!;
  const { width, height } = c;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = 0, bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (right < left) return c.toDataURL("image/png");
  const pad = 8;
  const out = document.createElement("canvas");
  out.width = Math.min(width, right - left + pad * 2);
  out.height = Math.min(height, bottom - top + pad * 2);
  out.getContext("2d")!.drawImage(c, left - pad, top - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
