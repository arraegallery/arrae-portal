import Link from "next/link";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { getAgreementAuto, getAgreementTemplate, getGallerySigner, REMINDER } from "@/lib/agreement";
import { AutoSettings, RemindButton } from "./AutoSettings";
import { AgreementSettings } from "./AgreementSettings";

const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

export default async function AgreementsPage() {
  await requireOwner();
  const [auto, template, signer, rows, selected] = await Promise.all([
    getAgreementAuto(),
    getAgreementTemplate(),
    getGallerySigner(),
    db
      .select({ a: s.agreements, name: s.artists.name })
      .from(s.agreements)
      .innerJoin(s.artists, eq(s.artists.id, s.agreements.artistId))
      .where(isNull(s.agreements.voidedAt))
      .orderBy(desc(s.agreements.sentAt)),
    db
      .selectDistinct({ id: s.artists.id, name: s.artists.name, onboarding: s.artists.onboarding })
      .from(s.applications)
      .innerJoin(s.artists, eq(s.artists.id, s.applications.artistId))
      .where(inArray(s.applications.status, ["Selected"]))
      .orderBy(asc(s.artists.name)),
  ]);
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.a.artistId)) latest.set(r.a.artistId, r);
  const waiting = [...latest.values()].filter((r) => !r.a.signedAt);
  const signed = [...latest.values()].filter((r) => r.a.signedAt);
  const notSent = selected.filter((x) => !latest.has(x.id));

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 pb-24 pt-8">
      <div>
        <h1 className="font-display text-4xl">Partnership Agreements</h1>
        <p className="mt-1 text-sm text-muted">
          Send the agreement from an artist&rsquo;s page (Onboarding, then &ldquo;Send to sign&rdquo;), or let the portal ask selected artists when they sign in (below). They read and sign it in their studio, and a signed PDF with a signing log is saved here.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <List title={`Waiting to sign (${waiting.length})`} empty="No one is waiting." action={<RemindButton ids={waiting.map((r) => r.a.id)} label="Remind all" />}>
          {waiting.map((r) => (
            <li key={r.a.id}>
              <Link href={`/admin/artists/${r.a.artistId}`} className="font-medium hover:underline">
                {r.name}
              </Link>{" "}
              <span className="text-muted">
                {r.a.sentBy.includes("@") ? "sent" : "asked at sign-in"} {day(r.a.sentAt)}
                {r.a.remindersSent > 0 && ` · reminded ${r.a.remindersSent}×, last ${day(r.a.lastRemindedAt!)}`}
              </span>{" "}
              <RemindButton ids={[r.a.id]} label="Remind" />
            </li>
          ))}
        </List>
        <List title={`Signed (${signed.length})`} empty="None signed in the portal yet.">
          {signed.map((r) => (
            <li key={r.a.id}>
              <Link href={`/admin/artists/${r.a.artistId}`} className="font-medium hover:underline">
                {r.name}
              </Link>{" "}
              <span className="text-muted">{day(r.a.signedAt!)}</span>{" "}
              <a href={`/api/agreements/${r.a.id}`} target="_blank" rel="noreferrer" className="underline">
                PDF
              </a>
            </li>
          ))}
        </List>
        <List title={`Selected, not sent in the portal (${notSent.length})`} empty="Everyone selected has one.">
          {notSent.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/artists/${x.id}`} className="font-medium hover:underline">
                {x.name}
              </Link>
              {(x.onboarding as { agreement?: boolean })?.agreement && <span className="text-muted"> · marked signed (Google)</span>}
            </li>
          ))}
        </List>
      </section>

      <AutoSettings
        mode={auto.mode}
        reminders={auto.reminders}
        cronReady={!!process.env.CRON_SECRET}
        schedule={`${REMINDER.firstAfterDays} days after it's sent, then every ${REMINDER.everyDays} days, up to ${REMINDER.max} reminders. Sent around 9 or 10am Miami time.`}
      />

      <AgreementSettings template={template.text} custom={template.custom} signer={signer} />
    </main>
  );
}

function List({ title, empty, children, action }: { title: string; empty: string; children: React.ReactNode[]; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <h2 className="text-xs uppercase tracking-wider text-muted">{title}</h2>
        <span className="ml-auto">{action}</span>
      </div>
      {children.length ? <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto text-sm">{children}</ul> : <p className="mt-2 text-sm text-muted">{empty}</p>}
    </div>
  );
}
