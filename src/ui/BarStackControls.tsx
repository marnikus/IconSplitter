// BarStackControls.tsx — what the main bar adds when other bars are waiting
// behind it (lib/barstack): ▲/▼ to bring another one up, and a small line that
// says how many others run and how far they are. Nothing renders for one bar.
import type { BarEntry } from "../lib/barstack";
import type { BarSeat } from "./useBarStack";

const SHOWN = 2;
const NAME_MAX = 18;

function shortName(title: string): string {
  return title.length > NAME_MAX ? `${title.slice(0, NAME_MAX - 1)}…` : title;
}

function progressOf(e: BarEntry): string {
  return `${shortName(e.title)} ${e.percent === null ? "…" : `${e.percent}%`}`;
}

/** "+3 more: Saving… 40% · Rendering… … · +1" */
export function stackNoteText(others: readonly BarEntry[]): string {
  const parts = others.slice(0, SHOWN).map(progressOf);
  if (others.length > SHOWN) parts.push(`+${others.length - SHOWN}`);
  return `+${others.length} more: ${parts.join(" · ")}`;
}

export function BarStackNote({ seat }: { seat: BarSeat }) {
  const { others } = seat;
  if (!seat.isMain || others.length === 0) return null;
  const full = others.map(progressOf).join("\n");
  return <span className="bar-stack-note" data-testid="bar-stack-note" title={full}>{stackNoteText(others)}</span>;
}

export function BarStackArrows({ seat }: { seat: BarSeat }) {
  if (!seat.isMain || seat.others.length === 0) return null;
  return (
    <span className="bar-stack-arrows">
      <button type="button" className="bar-stack-arrow" data-testid="bar-stack-prev" aria-label="Previous progress bar" onClick={seat.goPrev}>▲</button>
      <button type="button" className="bar-stack-arrow" data-testid="bar-stack-next" aria-label="Next progress bar" onClick={seat.goNext}>▼</button>
    </span>
  );
}
