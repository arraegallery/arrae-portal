import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata = { title: "Apply to ARRAE Gallery" };

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <a href="https://arraegallery.com" aria-label="ARRAE Gallery" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
          </a>
          <span className="text-sm text-muted">Artist application</span>
          <Link href="/login" className="ml-auto text-sm text-muted hover:underline">
            Already with ARRAE? Sign in
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
