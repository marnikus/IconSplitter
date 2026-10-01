// HelpButton.tsx — the "?" in the top bar: hotkeys and the honest browser
// limitations, so a user never wonders why a button copies a path instead of
// opening the OS file manager (RULE 4).

import { useState } from "react";

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="help-button"
        aria-expanded={open}
        aria-label="Help"
        onClick={() => setOpen((v) => !v)}
        className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
      >
        ?
      </button>
      {open && <HelpCard />}
    </div>
  );
}

function HelpCard() {
  return (
    <div
      data-testid="help-card"
      className="absolute top-9 right-0 z-50 w-80 space-y-2 rounded-xl border border-white/10 bg-slate-900 p-4 text-xs text-slate-300 shadow-2xl"
    >
      <h3 className="text-sm font-semibold text-white">Keyboard</h3>
      <ul className="space-y-1">
        <li><b>A</b> approve · <b>D</b> decline the shown pair</li>
        <li><b>↑ / ↓</b> navigate the list · <b>Space</b> fit / 100 % zoom</li>
        <li><b>Esc</b> close the comparison view</li>
      </ul>
      <h3 className="pt-1 text-sm font-semibold text-white">Browser limits</h3>
      <p>
        Browsers cannot open File Explorer nor use the absolute path — “Open in File Explorer”
        copies the root-relative path instead. Folder access needs Chrome or Edge.
      </p>
    </div>
  );
}
