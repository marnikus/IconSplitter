// LogList.tsx — the rows of the log, the session breaks between page loads, the
// honest notes (empty / unreadable / not saved / entries lost), and "Jump to
// latest". A row is drawn from lib/logformat's entryParts — the same words the
// Copy-all text is written from (L-6). Plain rows, memoised by entry identity: a
// folded repeat is a new object, everything else keeps its row (no windowing is
// needed at ≤ 5 000 single-line rows).

import { Fragment, memo } from "react";
import type { LogEntry } from "../lib/logentry";
import { entryParts } from "../lib/logformat";
import type { Follow } from "../lib/logscroll";
import type { Persist, Restore } from "./logstore";

interface ListProps {
  entries: readonly LogEntry[];
  bind: (el: HTMLDivElement | null) => void;
  follow: Follow;
  onJump: () => void;
  persist: Persist;
  restore: Restore;
  dropped: number;
}

export default function LogList(p: ListProps) {
  return (
    <div className="log-body" id="log-panel">
      <Notes entries={p.entries.length} persist={p.persist} restore={p.restore} dropped={p.dropped} />
      <div className="log-list" role="log" aria-live="off" aria-label="Log entries" tabIndex={0} ref={p.bind} data-testid="log-list">
        <Rows entries={p.entries} />
      </div>
      {!p.follow.following && (
        <button type="button" className="log-btn log-jump" data-testid="log-jump" onClick={p.onJump}>
          ↓ {p.follow.unseen} new — Jump to latest
        </button>
      )}
    </div>
  );
}

/** What the user must be told that the rows cannot say: each is a different situation (RULE 4). */
function Notes(p: { entries: number; persist: Persist; restore: Restore; dropped: number }) {
  return (
    <>
      {p.entries === 0 && <p className="log-note" role="status" data-testid="log-empty">No entries yet</p>}
      {p.restore === "corrupt" && <p className="log-note warn" data-testid="log-restore">Previous log could not be read — started empty</p>}
      {p.persist === "unavailable" && (
        <p className="log-note warn" data-testid="log-persist">Not saved to this browser (storage unavailable) — entries last until reload</p>
      )}
      {p.dropped > 0 && <p className="log-note warn" data-testid="log-dropped">{p.dropped} entries could not be recorded</p>}
    </>
  );
}

function Rows({ entries }: { entries: readonly LogEntry[] }) {
  let sid = "";
  return (
    <>
      {entries.map((e) => {
        const breaks = e.sid !== sid;
        sid = e.sid;
        return (
          <Fragment key={e.id}>
            {breaks && <div className="log-session" role="separator" data-testid="log-session">— session {e.sid} · {e.at.slice(0, 16).replace("T", " ")} —</div>}
            <LogRow entry={e} />
          </Fragment>
        );
      })}
    </>
  );
}

const LogRow = memo(function LogRow({ entry }: { entry: LogEntry }) {
  const p = entryParts(entry);
  return (
    <div className={`log-row ${entry.level}`} data-testid="log-row" data-entry-id={entry.id}>
      <time dateTime={p.iso} title={p.iso}>{p.time}</time>
      <span className="log-level"><span aria-hidden="true">{p.glyph}</span> {p.word}</span>
      <span className="log-feature">{p.feature}</span>
      <span className="log-action">{p.action}</span>
      <span className="log-message">{p.message}</span>
      {p.detail !== "" && <span className="log-detail">{p.detail}</span>}
      {p.repeat > 1 && <span className="log-repeat">×{p.repeat}</span>}
    </div>
  );
});
