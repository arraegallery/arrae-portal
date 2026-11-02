import Link from "next/link";
import { requireArtist } from "@/lib/artist-auth";
import { AGREEMENT_TITLE, currentAgreement } from "@/lib/agreement";
import { Prose } from "@/components/Prose";
import { SignForm } from "./SignForm";

const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

export default async function AgreementPage() {
  const { artist, artistIds, email } = await requireArtist();
  const a = await currentAgreement(artistIds);
  if (!a)
    return (
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10">
        <h1 className="font-display text-4xl">Partnership Agreement</h1>
        <p className="mt-2 text-sm text-muted">There&rsquo;s nothing to sign right now. When ARRAE sends you an agreement, it will appear here.</p>
        <Link href="/studio" className="mt-4 inline-block text-sm underline">
          Back to your studio
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{a.signedAt ? `Signed ${day(a.signedAt)}` : `Sent ${day(a.sentAt)}`}</p>
      <h1 className="font-display text-4xl">{AGREEMENT_TITLE}</h1>
      {a.signedAt && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Thank you, {artist.name.split(/\s+/)[0]}. You signed this agreement as &ldquo;{a.artistName}&rdquo;.
          <a href={`/api/agreements/${a.id}`} target="_blank" rel="noreferrer" className="ml-auto rounded-md bg-ink px-3 py-1.5 text-white">
            Download signed PDF
          </a>
        </div>
      )}
      <article className="mt-6 rounded-lg bg-white p-6 ring-1 ring-line sm:p-8">
        <Prose text={a.body} />
        <div className="mt-8 grid gap-6 border-t border-line pt-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">For ARRAE Gallery</p>
            {a.gallerySignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.gallerySignature} alt={`Signature of ${a.galleryName}`} className="mt-2 h-14 w-auto" />
            ) : (
              <p className="mt-2 font-display text-3xl italic">{a.galleryName}</p>
            )}
            <p className="mt-1">
              {a.galleryName}, {a.galleryTitle}
            </p>
            <p className="text-muted">{day(a.sentAt)}</p>
          </div>
          {a.signedAt && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Artist</p>
              {a.artistSignature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.artistSignature} alt={`Signature of ${a.artistName}`} className="mt-2 h-14 w-auto" />
              )}
              <p className="mt-1">{a.artistName}</p>
              <p className="text-muted">{day(a.signedAt)}</p>
            </div>
          )}
        </div>
      </article>
      {!a.signedAt && <SignForm id={a.id} defaultName={artist.name} email={email} />}
    </main>
  );
}
