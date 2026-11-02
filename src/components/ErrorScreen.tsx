"use client";

import { useEffect } from "react";

/**
 * Shown instead of a blank "Application error" page. The usual cause is the portal being
 * updated while a page was open, so the first try is a reload; anything already saved stays saved.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to find Server Action|reading 'call'/i.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    console.error(error);
    // An old page after an update: reload once by itself.
    if (stale && !sessionStorage.getItem("arrae-reloaded")) {
      sessionStorage.setItem("arrae-reloaded", "1");
      window.location.reload();
    }
  }, [error, stale]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 text-center">
      <h1 className="font-display text-3xl">This page needs a refresh</h1>
      <p className="mt-2 text-sm text-muted">
        The portal may have been updated while this page was open. Anything you already saved or sent went through. Reload to pick up where you left off.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => (sessionStorage.removeItem("arrae-reloaded"), window.location.reload())} className="rounded-md bg-ink px-4 py-2 text-sm text-white">
          Reload the page
        </button>
        {reset && (
          <button onClick={reset} className="rounded-md px-4 py-2 text-sm ring-1 ring-line">
            Try again
          </button>
        )}
      </div>
      {error?.digest && <p className="mt-4 text-xs text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
