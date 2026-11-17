// AiSourcePanel.tsx — the row's AI source beside the edit mode's artboard
// (2026-11-06): the same main image the row shows, under an "AI SOURCE" tag, so
// the vector can be compared with what it was drawn from while editing.

export default function AiSourcePanel({ url, name, testid }: { url: string | null; name: string; testid: string }) {
  return (
    <figure className="svg-edit-ai" data-testid={testid}>
      <span className="svg-edit-ai-tag">AI SOURCE</span>
      {url === null
        ? <span className="svg-edit-ai-missing">Unreadable</span>
        : <img src={url} alt={name} data-testid={`${testid}-img`} />}
    </figure>
  );
}
