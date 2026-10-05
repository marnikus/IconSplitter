// ConfirmPrompt.tsx — the request exactly as it will be sent: the pager over
// the requests, the five named text blocks (labels sit OUTSIDE the text nodes,
// so the blocks joined with the single separators ARE the request text), the
// rules editor, a copy button and the JSON view with the key hidden. Nothing
// here builds text: it renders the PreparedBatch it is given.

import { useState } from "react";
import { elideImage, type PreparedBatch } from "../../lib/svgpayload";
import type { BlockId, PromptBlock } from "../../lib/svgprompt";
import { wireHeaders, type ChatRequest } from "../../lib/svgrequest";

interface PromptProps {
  batch: PreparedBatch;
  endpoint: string;
  /** 0-based pager position and the number of requests. */
  index: number;
  total: number;
  onIndex: (index: number) => void;
  /** The stored rules, untrimmed — what the textarea edits. */
  rules: string;
  onRules: (text: string) => void;
}

const LABELS: Record<BlockId, { title: string; note: string }> = {
  summary: { title: "Batch summary", note: "read-only" },
  positions: { title: "Ordered positions", note: "read-only · derived from the selection" },
  protocol: { title: "Output order & naming", note: "required by the app · locked" },
  rules: { title: "Generation rules", note: "editable" },
  naming: { title: "Icon name", note: "required by the app · locked" },
};

export default function ConfirmPrompt(p: PromptProps) {
  const { plan, parts, fingerprint } = p.batch;
  return (
    <section className="svg-prompt-preview" data-testid="svg-confirm-prompt">
      <div className="svg-pager-row">
        <Pager index={p.index} total={p.total} onIndex={p.onIndex} />
        <span className="svg-note">
          grid {plan.cols}×{plan.rows} · {plan.items.length} image(s) · fingerprint <code data-testid="svg-confirm-fingerprint">{fingerprint}</code>
        </span>
        <CopyText text={parts.text} label={`request ${p.index + 1} of ${p.total}`} />
      </div>
      {parts.blocks.map((b) => <Block key={b.id} block={b} rules={p.rules} onRules={p.onRules} />)}
      <RequestJson request={p.batch.request} endpoint={p.endpoint} />
    </section>
  );
}

function Pager({ index, total, onIndex }: { index: number; total: number; onIndex: (i: number) => void }) {
  return (
    <span className="svg-pager" data-testid="svg-confirm-pager">
      <span>Request</span>
      <button type="button" className="svg-btn tiny" data-testid="svg-confirm-pager-prev" aria-label="Previous request"
        disabled={index === 0} onClick={() => onIndex(index - 1)}>‹</button>
      <span data-testid="svg-confirm-pager-index">{index + 1} of {total}</span>
      <button type="button" className="svg-btn tiny" data-testid="svg-confirm-pager-next" aria-label="Next request"
        disabled={index >= total - 1} onClick={() => onIndex(index + 1)}>›</button>
    </span>
  );
}

function Block({ block, rules, onRules }: { block: PromptBlock; rules: string; onRules: (t: string) => void }) {
  const label = LABELS[block.id];
  return (
    <div className="svg-block">
      <div className="svg-field-label">
        <span>{label.title}</span>
        <span data-testid={`svg-prompt-note-${block.id}`}>{label.note}</span>
      </div>
      {block.editable
        ? <RulesEditor rules={rules} onRules={onRules} />
        : <pre className="svg-prompt-block" data-testid={`svg-prompt-block-${block.id}`}>{block.text}</pre>}
    </div>
  );
}

function RulesEditor({ rules, onRules }: { rules: string; onRules: (text: string) => void }) {
  return (
    <>
      <textarea className="svg-prompt svg-confirm-rules" data-testid="svg-confirm-rules" aria-label="Generation rules"
        spellCheck={false} rows={6} value={rules} onChange={(e) => onRules(e.target.value)} />
      {rules !== rules.trim() && (
        <p className="svg-note" data-testid="svg-confirm-rules-note">Leading and trailing spaces are removed when sent.</p>
      )}
    </>
  );
}

/** The request as the wire carries it, minus the image — and with the key hidden. */
function RequestJson({ request, endpoint }: { request: ChatRequest; endpoint: string }) {
  const headers = Object.entries(wireHeaders("‹hidden›")).map(([name, value]) => `${name}: ${value}`);
  return (
    <details className="svg-json">
      <summary className="svg-field-label"><span>Request JSON · headers + body, image elided</span></summary>
      <pre className="svg-prompt-block" data-testid="svg-confirm-json-headers">{[`POST ${endpoint}`, ...headers].join("\n")}</pre>
      <pre className="svg-prompt-block" data-testid="svg-confirm-json">{JSON.stringify(elideImage(request), null, 2)}</pre>
    </details>
  );
}

/** Copies the exact text. The outcome belongs to the text it was for, so paging clears it. */
function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<{ text: string; message: string } | null>(null);
  const copy = () => {
    void Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(
      () => setDone({ text, message: `Copied ${label}` }),
      () => setDone({ text, message: "Clipboard is blocked — select the text and copy it" }),
    );
  };
  return (
    <>
      <button type="button" className="svg-link" data-testid="svg-confirm-copy" onClick={copy}>Copy exact prompt</button>
      {done !== null && done.text === text && <span className="svg-note" role="status" data-testid="svg-confirm-copy-status">{done.message}</span>}
    </>
  );
}
