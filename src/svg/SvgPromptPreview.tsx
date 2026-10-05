// SvgPromptPreview.tsx — the payload a confirmation page must show before the
// user says yes (feature §1): the FINAL prompt text verbatim, and the wire
// fields of the request the runner will send. Both come from the same value the
// runner builds with `lib/svgpayload`, so the preview cannot drift.
//
// The prompt never depends on the image; the wire list is shown only once the
// page's contact sheet really exists, because claims about a not-yet-built
// payload would be a guess (RULE 4: no invented numbers, no fake success).

import { payloadLines } from "../lib/svgpayload";
import type { ChatRequest } from "../lib/svgrequest";

/** ready = the composite exists; blocked = it could not be built at all. */
export type PreviewState = "building" | "ready" | "blocked";

export interface SvgPromptPreviewProps {
  /** The final prompt text, exactly as it will be sent. */
  prompt: string;
  /** The request exactly as built for this page (image part included). */
  request: ChatRequest;
  state: PreviewState;
}

export default function SvgPromptPreview({ prompt, request, state }: SvgPromptPreviewProps) {
  return (
    <section className="svg-payload-preview">
      <h3 className="svg-payload-title">Final API prompt — sent verbatim</h3>
      <pre className="svg-payload-prompt" data-testid="svg-confirm-prompt">{prompt}</pre>
      <h3 className="svg-payload-title">Request payload</h3>
      <WireLines request={request} state={state} />
    </section>
  );
}

function WireLines({ request, state }: { request: ChatRequest; state: PreviewState }) {
  if (state === "ready") {
    return (
      <ul className="svg-payload-lines" data-testid="svg-confirm-payload">
        {payloadLines(request).map((line) => <li key={line}>{line}</li>)}
      </ul>
    );
  }
  if (state === "blocked") {
    return (
      <p className="svg-note error" data-testid="svg-confirm-payload-waiting">
        The contact sheet could not be built, so this request will not be sent.
      </p>
    );
  }
  return (
    <p className="svg-note" data-testid="svg-confirm-payload-waiting">
      Building the contact sheet in memory — the exact payload appears here as soon as it exists.
    </p>
  );
}
