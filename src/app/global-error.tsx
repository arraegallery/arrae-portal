"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/ErrorScreen";

/** Last resort when even the root layout fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
