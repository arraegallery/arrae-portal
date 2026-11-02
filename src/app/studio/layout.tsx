import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArtist } from "@/lib/artist-auth";
import { supabaseForRequest } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function signOut() {
  "use server";
  const supabase = await supabaseForRequest();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { artist } = await requireArtist();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-x-6 px-4 py-3">
          <Link href="/studio" aria-label="ARRAE studio home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-6 w-auto" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/studio" className="rounded-md px-2 py-1 hover:bg-white">
              My studio
            </Link>
            <Link href="/studio/messages" className="rounded-md px-2 py-1 hover:bg-white">
              Messages
            </Link>
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span className="hidden sm:inline">{artist.name}</span>
            <button className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-white">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
