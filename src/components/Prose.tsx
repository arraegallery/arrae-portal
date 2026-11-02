import { Fragment } from "react";

/** Renders the small amount of formatting the terms use: ## headings, **bold**, _italic_, [links](url), "- " bullets. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{inline(p.slice(2, -2))}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link)
      return (
        <a key={i} href={link[2]} className="underline" target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Prose({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={`space-y-4 text-sm leading-relaxed ${className}`}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.length === 1 && lines[0].startsWith("## ")) return <h2 key={i} className="pt-2 font-display text-2xl">{inline(lines[0].slice(3))}</h2>;
        const out: React.ReactNode[] = [];
        let bullets: string[] = [];
        const flush = () => {
          if (bullets.length) out.push(<ul key={`u${out.length}`} className="list-disc pl-5">{bullets.map((b, j) => <li key={j}>{inline(b)}</li>)}</ul>);
          bullets = [];
        };
        lines.forEach((l, j) => {
          if (/^\s*[-•]\s+/.test(l)) bullets.push(l.replace(/^\s*[-•]\s+/, ""));
          else {
            flush();
            out.push(
              <Fragment key={`l${j}`}>
                {inline(l)}
                {j < lines.length - 1 && <br />}
              </Fragment>,
            );
          }
        });
        flush();
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}
