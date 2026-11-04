"use client";

import { parseAmount } from "@/lib/amount";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadPhotos } from "@/lib/photo-upload";
import { ArtworkImage, formatPrice, formatSize } from "@/components/ArtworkImage";
import type { Studio } from "@/lib/studio";
import type { getStudioBookings } from "@/lib/logistics";
import { bookMyTime, cancelMyBooking, addMyWorkPhotos, getMyWorkPhotos, makeMyMainPhoto, prepareMyPhotoUploads, prepareUploads, putForwardWorks, removeMyPhoto, submitNewWork, updateMyWork, withdrawWork } from "./actions";
import { PhotoManager } from "@/components/PhotoManager";

type Work = Studio["works"][number];
type OpenShow = Studio["openShows"][number];
type StudioBookings = Awaited<ReturnType<typeof getStudioBookings>>;
const TZ = "America/New_York";
const fmtSlot = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, ...o });

const input = "mt-0.5 w-full rounded-md bg-white px-3 py-2 text-sm text-ink ring-1 ring-line focus:ring-ink";
const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null);

export function StudioHome({
  name,
  studio,
  unread,
  bookings,
  agreement,
}: {
  name: string;
  studio: Studio;
  unread: number;
  bookings: StudioBookings;
  agreement: { id: string; signed: boolean } | null;
}) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <section className="py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Your ARRAE studio</p>
        <h1 className="font-display text-4xl">Welcome, {first}</h1>
        {studio.applications.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {studio.applications.map((a) => (
              <span key={a.showId} className="rounded-full bg-white px-3 py-1 ring-1 ring-line">
                {a.show}: {a.label}
              </span>
            ))}
          </div>
        )}
        {unread > 0 && (
          <Link href="/studio/messages" className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm text-white">
            You have {unread} new message{unread === 1 ? "" : "s"} from ARRAE →
          </Link>
        )}
      </section>

      {agreement && !agreement.signed && (
        <section className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-ink p-5 text-white sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">One step before your show</p>
            <h2 className="font-display text-2xl">Your Partnership Agreement is ready to sign</h2>
            <p className="mt-1 text-sm text-white/80">Read it through and sign right here. It takes a couple of minutes.</p>
          </div>
          <Link href="/studio/agreement" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-ink">
            Read and sign
          </Link>
        </section>
      )}
      {agreement?.signed && (
        <p className="mb-4 text-sm text-muted">
          Your Partnership Agreement is signed.{" "}
          <a href={`/api/agreements/${agreement.id}`} target="_blank" rel="noreferrer" className="underline">
            Download your copy (PDF)
          </a>
        </p>
      )}

      {bookings.map((b) => (
        <BookTime key={b.id} b={b} />
      ))}

      {studio.openShows.map((show) => (
        <OpenCall key={show.id} show={show} works={studio.works} />
      ))}

      <section className="mt-12">
        <h2 className="font-display text-2xl">Your works</h2>
        <p className="mt-1 text-sm text-muted">Keep titles, sizes and prices up to date here. ARRAE sees every change.</p>
        {studio.works.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No works yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studio.works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function OpenCall({ show, works }: { show: OpenShow; works: Work[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const inShow = works.filter((w) => w.shows.some((x) => x.showId === show.id));
  const eligible = works.filter((w) => !w.sold && !w.shows.some((x) => x.showId === show.id));

  const putForward = () =>
    start(async () => {
      setNote(null);
      try {
        await putForwardWorks([...picked], show.id);
        setNote({ ok: true, text: `Thank you. ${picked.size === 1 ? "That work is" : `Those ${picked.size} works are`} now in front of ARRAE for ${show.name}.` });
        setPicked(new Set());
        router.refresh();
      } catch (e) {
        setNote({ ok: false, text: (e as Error).message });
      }
    });
  const withdraw = (workId: string) =>
    start(async () => {
      setNote(null);
      try {
        await withdrawWork(workId, show.id);
        router.refresh();
      } catch (e) {
        setNote({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-line sm:p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Open for submissions</p>
      <h2 className="font-display text-3xl">{show.name}</h2>
      {show.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm">{show.description}</p>}
      {show.deadline && <p className="mt-1 text-sm text-muted">Submit by {fmtDate(show.deadline)}</p>}

      {inShow.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-wider text-muted">Your works for {show.name}</h3>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {inShow.map((w) => {
              const entry = w.shows.find((x) => x.showId === show.id)!;
              return (
                <li key={w.id} className="overflow-hidden rounded-lg ring-1 ring-line">
                  <ArtworkImage image={w.image ?? undefined} title={w.title} fallbackRatio={w.width && w.height ? w.width / w.height : null} />
                  <div className="p-2 text-sm">
                    <p className="truncate font-medium">{w.title}</p>
                    <p className="text-xs text-muted">{entry.label}</p>
                    {entry.canWithdraw && (
                      <button onClick={() => withdraw(w.id)} disabled={pending} className="mt-1 text-xs text-muted underline">
                        Take this one back out
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-xl">Put forward a past work</h3>
          <p className="text-sm text-muted">Still have a piece available? Tick it and we&apos;ll consider it for {show.name}.</p>
          {eligible.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing else to put forward right now.</p>
          ) : (
            <>
              <ul className="mt-3 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto pr-1">
                {eligible.map((w) => {
                  const on = picked.has(w.id);
                  return (
                    <li key={w.id}>
                      <button
                        onClick={() =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (n.has(w.id)) n.delete(w.id);
                            else n.add(w.id);
                            return n;
                          })
                        }
                        className={`block w-full overflow-hidden rounded-md text-left ring-2 ${on ? "ring-ink" : "ring-transparent"}`}
                        aria-pressed={on}
                      >
                        <ArtworkImage image={w.image ?? undefined} title={w.title} fallbackRatio={w.width && w.height ? w.width / w.height : null} />
                        <span className="block truncate px-1 py-1 text-xs">
                          {on ? "✓ " : ""}
                          {w.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button onClick={putForward} disabled={!picked.size || pending} className="mt-3 rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
                {pending ? "Sending…" : `Put forward ${picked.size || ""} work${picked.size === 1 ? "" : "s"}`.replace("  ", " ")}
              </button>
            </>
          )}
        </div>
        <div>
          <h3 className="font-display text-xl">Submit a new work</h3>
          <p className="text-sm text-muted">Add photos and details for a piece we haven&apos;t seen yet.</p>
          {adding ? (
            <NewWorkForm
              show={show}
              onDone={(title) => {
                setAdding(false);
                setNote({ ok: true, text: `Thank you. "${title}" is now in front of ARRAE for ${show.name}.` });
                router.refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button onClick={() => setAdding(true)} className="mt-3 rounded-md px-4 py-2 text-sm ring-1 ring-line hover:bg-paper">
              + Add a new work
            </button>
          )}
        </div>
      </div>
      {note && <p className={`mt-4 rounded-md p-3 text-sm ring-1 ${note.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{note.text}</p>}
    </section>
  );
}

function NewWorkForm({ show, onDone, onCancel }: { show: OpenShow; onDone: (title: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: "", year: "", medium: "", height: "", width: "", depth: "", unit: "in", price: "", description: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        if (!f.title.trim()) throw new Error("Give the work a title");
        if (!files.length) throw new Error("Add at least one photo");
        if (!f.price.trim()) throw new Error("Add a price (USD)");
        if (!f.height.trim() || !f.width.trim()) throw new Error("Add the height and width");
        setProgress("Preparing photos…");
        const { workId, slots } = await prepareUploads(files.length);
        const images = await uploadPhotos(files, slots, setProgress);
        setProgress("Saving…");
        const r = await submitNewWork({ workId, ...f, images, showId: show.id });
        if (!r.ok) throw new Error(r.error);
        onDone(f.title.trim());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setProgress(null);
      }
    });

  return (
    <div className="mt-3 grid grid-cols-6 gap-3 rounded-lg bg-paper p-4 ring-1 ring-line">
      <label className="col-span-6 text-xs text-muted">
        Photos (up to 5, the first one is the main image)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
          className="mt-1 block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white"
        />
      </label>
      {files.length > 0 && (
        <div className="col-span-6 flex gap-2">
          {files.map((file, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded object-cover ring-1 ring-line" />
          ))}
        </div>
      )}
      <label className="col-span-4 text-xs text-muted">
        Title
        <input value={f.title} onChange={set("title")} className={input} />
      </label>
      <label className="col-span-2 text-xs text-muted">
        Year
        <input value={f.year} onChange={set("year")} className={input} />
      </label>
      <label className="col-span-6 text-xs text-muted">
        Medium
        <input value={f.medium} onChange={set("medium")} placeholder="Oil on canvas" className={input} />
      </label>
      <label className="col-span-2 text-xs text-muted">
        Height
        <input value={f.height} onChange={set("height")} inputMode="decimal" className={input} />
      </label>
      <label className="col-span-2 text-xs text-muted">
        Width
        <input value={f.width} onChange={set("width")} inputMode="decimal" className={input} />
      </label>
      <label className="col-span-1 text-xs text-muted">
        Depth
        <input value={f.depth} onChange={set("depth")} inputMode="decimal" className={input} />
      </label>
      <label className="col-span-1 text-xs text-muted">
        Unit
        <select value={f.unit} onChange={set("unit")} className={input}>
          <option value="in">in</option>
          <option value="cm">cm</option>
        </select>
      </label>
      <label className="col-span-3 text-xs text-muted">
        Price (USD)
        <input value={f.price} onChange={set("price")} inputMode="decimal" placeholder="1200" className={input} />
      </label>
      <label className="col-span-6 text-xs text-muted">
        About this work (optional)
        <textarea value={f.description} onChange={set("description")} className={`${input} h-20`} />
      </label>
      <div className="col-span-6 flex flex-wrap items-center gap-3">
        {error && <span className="text-sm text-rose-700">{error}</span>}
        {progress && <span className="text-sm text-muted">{progress}</span>}
        <button onClick={onCancel} disabled={pending} className="ml-auto rounded-md px-3 py-1.5 text-sm ring-1 ring-line">
          Cancel
        </button>
        <button onClick={submit} disabled={pending} className="rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? "Submitting…" : `Submit for ${show.name}`}
        </button>
      </div>
    </div>
  );
}

function WorkCard({ work: initial }: { work: Work }) {
  const router = useRouter();
  const [work, setWork] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const begin = () => {
    setDraft({
      title: work.title,
      year: work.year ?? "",
      medium: work.medium ?? "",
      price: work.price === null ? "" : String(work.price),
      height: work.height === null ? "" : String(work.height),
      width: work.width === null ? "" : String(work.width),
      depth: work.depth === null ? "" : String(work.depth),
      unit: work.unit,
    });
    setEditing(true);
  };
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const r = await updateMyWork(work.id, draft);
        if (!r.ok) throw new Error(r.error);
        const n = (v: string) => (v.trim() ? parseAmount(v) : null);
        setWork({ ...work, ...draft, price: n(draft.price), height: n(draft.height), width: n(draft.width), depth: n(draft.depth) });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const field = (k: string, label: string, cls: string) => (
    <label className={`text-xs text-muted ${cls}`}>
      {label}
      <input value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line" />
    </label>
  );
  return (
    <li className="overflow-hidden rounded-lg bg-white ring-1 ring-line">
      <ArtworkImage image={work.image ?? undefined} title={work.title} fallbackRatio={work.width && work.height ? work.width / work.height : null} />
      <div className="p-3 text-sm">
        {!editing ? (
          <>
            <div className="flex items-start gap-2">
              <p className="font-medium">{work.title}</p>
              {!work.sold && (
                <span className="ml-auto flex shrink-0 gap-3 text-xs text-muted">
                  <button onClick={() => setPhotos(!photos)} className="hover:underline">
                    Photos
                  </button>
                  <button onClick={begin} className="hover:underline">
                    Edit
                  </button>
                </span>
              )}
            </div>
            {work.photosRequested && !work.sold && (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
                <p className="font-medium">ARRAE asked for better photos of this work.</p>
                {work.photosRequestNote && <p className="mt-1 whitespace-pre-line">{work.photosRequestNote}</p>}
                {!photos && (
                  <button onClick={() => setPhotos(true)} className="mt-1.5 rounded-md bg-ink px-2.5 py-1 text-white">
                    Upload new photos
                  </button>
                )}
              </div>
            )}
            {photos && (
              <div className="mt-2">
                <PhotoManager
                  intro="Straight on, in good natural light, filling the frame, without glare. The main photo is the one ARRAE sees first."
                  actions={{
                    list: () => getMyWorkPhotos(work.id),
                    prepare: (n) => prepareMyPhotoUploads(work.id, n),
                    add: async (imgs, asMain) => {
                      const next = await addMyWorkPhotos(work.id, imgs, asMain);
                      setWork((w) => ({ ...w, photosRequested: false }));
                      return next;
                    },
                    makeMain: (id) => makeMyMainPhoto(work.id, id),
                    remove: (id) => removeMyPhoto(work.id, id),
                  }}
                  onChange={(main) => setWork((w) => ({ ...w, image: main ? { id: main.id, thumb: main.thumb, full: main.full, w: main.w, h: main.h } : null }))}
                />
              </div>
            )}
            <p className="text-xs text-muted">
              {[work.year, work.medium].filter(Boolean).join(" · ")}
              {work.year || work.medium ? " · " : ""}
              {formatSize(work)} · {formatPrice(work.price)}
              {work.sold ? " · Sold" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {work.shows.map((x) => (
                <span key={x.showId} className="rounded-full bg-paper px-2 py-0.5 text-[11px] ring-1 ring-line">
                  {x.name}: {x.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {field("title", "Title", "col-span-6")}
            {field("year", "Year", "col-span-2")}
            {field("medium", "Medium", "col-span-4")}
            {field("height", "H", "col-span-2")}
            {field("width", "W", "col-span-2")}
            {field("depth", "D", "col-span-2")}
            {field("price", "Price (USD)", "col-span-4")}
            <label className="col-span-2 text-xs text-muted">
              Unit
              <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="mt-0.5 w-full rounded-md bg-white px-2 py-1.5 text-sm text-ink ring-1 ring-line">
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </label>
            <div className="col-span-6 flex items-center gap-2">
              {error && <span className="text-xs text-rose-700">{error}</span>}
              <button onClick={() => setEditing(false)} className="ml-auto rounded-md px-3 py-1 text-xs ring-1 ring-line">
                Cancel
              </button>
              <button onClick={save} disabled={pending} className="rounded-md bg-ink px-3 py-1 text-xs text-white disabled:opacity-50">
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function BookTime({ b }: { b: StudioBookings[number] }) {
  const router = useRouter();
  const [changing, setChanging] = useState(!b.booking);
  const [day, setDay] = useState(b.days[0]?.date ?? "");
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const what = b.kind === "dropoff" ? "drop-off" : "pick-up";
  const slots = b.days.find((d) => d.date === day)?.slots ?? [];
  const book = () =>
    run(async () => {
      setMsg(null);
      try {
        const r = await bookMyTime(b.id, start, note);
        setMsg({ ok: true, text: `You're booked for ${fmtSlot(r.start, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}. We've let ARRAE know.` });
        setChanging(false);
        setStart("");
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  return (
    <section className="mb-8 rounded-xl bg-white p-5 ring-1 ring-line">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{b.show}</p>
      <h2 className="font-display text-2xl">{b.booking ? `Your ${what}` : `Pick a ${what} time`}</h2>
      <p className="mt-1 text-sm text-muted">
        {b.kind === "dropoff" ? "Bring" : "Collect"}: {b.works.join(", ")}
        {b.location ? ` · ${b.location}` : ""}
      </p>
      {b.note && <p className="mt-2 whitespace-pre-line text-sm">{b.note}</p>}
      {b.booking && !changing && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            {fmtSlot(b.booking.start, { weekday: "long", month: "long", day: "numeric" })} at {fmtSlot(b.booking.start, { hour: "numeric", minute: "2-digit" })}
          </p>
          <button onClick={() => setChanging(true)} className="text-sm underline">
            Change time
          </button>
          <button
            disabled={pending}
            onClick={() =>
              confirm(`Cancel your ${what}?`) &&
              run(async () => {
                await cancelMyBooking(b.booking!.id);
                setChanging(true);
                router.refresh();
              })
            }
            className="text-sm text-rose-700 underline"
          >
            Cancel
          </button>
        </div>
      )}
      {changing &&
        (b.days.length === 0 ? (
          <p className="mt-4 text-sm text-muted">There are no open times left. Send us a message and we&rsquo;ll find one.</p>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {b.days.map((d) => (
                <button
                  key={d.date}
                  onClick={() => (setDay(d.date), setStart(""))}
                  disabled={!d.slots.some((x) => x.left > 0)}
                  className={`rounded-lg px-3 py-2 text-sm ring-1 disabled:opacity-40 ${day === d.date ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}
                >
                  {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {slots.map((x) => (
                <button
                  key={x.start}
                  disabled={x.left < 1}
                  onClick={() => setStart(x.start)}
                  className={`rounded-md px-3 py-1.5 text-sm ring-1 disabled:line-through disabled:opacity-40 ${start === x.start ? "bg-ink text-white ring-ink" : "bg-paper ring-line"}`}
                >
                  {fmtSlot(x.start, { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs text-muted">
              Anything we should know? (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A friend is dropping off for me, I'm coming by car…" className={input} />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button disabled={!start || pending} onClick={book} className="rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">
                {pending ? "Booking…" : start ? `Book ${fmtSlot(start, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Pick a time"}
              </button>
              {b.booking && (
                <button onClick={() => setChanging(false)} className="text-sm text-muted underline">
                  Keep my current time
                </button>
              )}
            </div>
          </div>
        ))}
      {msg && <p className={`mt-3 rounded-md p-3 text-sm ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>{msg.text}</p>}
    </section>
  );
}
