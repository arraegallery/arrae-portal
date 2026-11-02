"use client";

import { useEffect, useRef, useState, useTransition } from "react";

export type ThreadMessage = { id: number; sender: "arrae" | "artist"; body: string; at: string; read: boolean };

/** A two-sided conversation. `me` is whose messages sit on the right. */
export function Thread({
  initial,
  me,
  send,
  otherName,
  placeholder,
}: {
  initial: ThreadMessage[];
  me: "arrae" | "artist";
  send: (body: string) => Promise<ThreadMessage>;
  otherName: string;
  placeholder: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      try {
        const saved = await send(body);
        setMessages((m) => [...m, saved]);
        setDraft("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };
  return (
    <div className="rounded-lg bg-white ring-1 ring-line">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.sender === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-ink text-white" : "bg-paper ring-1 ring-line"}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-white/60" : "text-muted"}`}>
                  {mine ? "You" : otherName} · {new Date(m.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit()}
          placeholder={placeholder}
          className="h-24 w-full rounded-md bg-white p-2 text-sm ring-1 ring-line"
        />
        <div className="mt-2 flex items-center gap-3">
          {error && <span className="text-xs text-rose-700">{error}</span>}
          <button onClick={submit} disabled={pending || !draft.trim()} className="ml-auto rounded-md bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-40">
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
