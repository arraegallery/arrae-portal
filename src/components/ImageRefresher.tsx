"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Image links are signed and expire. When a picture fails to load, or a page came back without a
 * link for a picture that exists, this reloads the page's data quietly so every image gets a fresh
 * link. Throttled so a picture that is truly missing can't cause a loop.
 */
const EVENT = "arrae:image-broken";
/**
 * onError for work pictures: try the same picture once more after a moment (most failures are
 * a blip), and only if that fails too, ask the page for fresh links.
 */
export function reportBrokenImage(e?: { currentTarget: HTMLImageElement }) {
  const img = e?.currentTarget;
  if (img && !img.dataset.retried) {
    img.dataset.retried = "1";
    const src = img.src;
    setTimeout(() => {
      img.src = src + (src.includes("?") ? "&" : "?") + "retry=1";
    }, 700 + Math.random() * 800);
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

const GAP_MS = 2 * 60 * 1000;
const PERIOD_MS = 6 * 3600 * 1000;
/** Most automatic reloads for broken or missing pictures per page visit. */
const MAX_TRIES = 3;

export function ImageRefresher() {
  const router = useRouter();
  // Start counting again on each page.
  const page = usePathname();
  useEffect(() => {
    let last = Date.now();
    let tries = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending || Date.now() - last < GAP_MS) return;
      // Wait a moment so a burst of failures becomes one reload.
      pending = setTimeout(() => {
        pending = null;
        last = Date.now();
        tries++;
        router.refresh();
      }, 800);
    };
    // A failure on first load is worth one quick retry.
    let firstRetry = true;
    const onBroken = () => {
      if (tries >= MAX_TRIES || pending) return;
      if (firstRetry) {
        firstRetry = false;
        last = 0;
      }
      refresh();
    };
    window.addEventListener(EVENT, onBroken);
    const check = setInterval(() => {
      // A picture that failed before the page finished loading never reports it, so look for those too.
      let failed = false;
      for (const img of Array.from(document.images)) {
        if (!img.complete || img.naturalWidth > 0 || !(img.currentSrc.includes("/storage/") || img.currentSrc.includes("/img/"))) continue;
        if (img.dataset.retried) failed = true;
        else reportBrokenImage({ currentTarget: img }); // it failed before the page could hear about it: give it its retry
      }
      if (failed || document.querySelector("[data-missing-image]")) onBroken();
    }, 5000);
    // Links last 12 hours; refresh well before that while the page stays open.
    const periodic = setInterval(() => {
      if (document.visibilityState === "visible") {
        last = 0;
        refresh();
      }
    }, PERIOD_MS);
    return () => {
      window.removeEventListener(EVENT, onBroken);
      clearInterval(check);
      clearInterval(periodic);
      if (pending) clearTimeout(pending);
    };
  }, [router, page]);
  return null;
}
