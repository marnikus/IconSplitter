// SvgConnections.tsx — the quick-switch dropdown of saved provider setups plus,
// for an image connection, the full documented image-parameter grid (research
// 2026-10-16: archive/2026-10-16-connections). No rule lives here: every value
// comes from the props and every change goes back through one callback.

import {
  BACKGROUNDS, IMAGE_FORMATS, IMAGE_N_MAX, IMAGE_N_MIN, QUALITIES, RESPONSE_FORMATS, SIZE_PRESETS,
  clampCustomDim, type Connection, type ConnectionKind,
} from "../lib/svgconnections";
import { NumberField, Select } from "../ui/fields";

export interface SvgConnectionsProps {
  connections: Connection[];
  activeConn: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  onMeta: (patch: { name?: string; kind?: ConnectionKind }) => void;
  onImage: (patch: Partial<Connection["image"]>) => void;
}

/** The dropdown row: which setup is live, its name/kind, add/remove. */
export function ConnectionRow(p: SvgConnectionsProps) {
  const active = p.connections.find((c) => c.id === p.activeConn) ?? p.connections[0];
  if (!active) return null;
  return (
    <div className="svg-conn-row" data-testid="svg-connection-row">
      <Select label="Connection" testid="svg-connection-select" value={active.id}
        options={p.connections.map((c) => [c.id, `${c.name} · ${c.kind === "image" ? "image" : "text"}`])}
        onChange={p.onSwitch} />
      <label className="svg-field">
        <span className="svg-label">Name</span>
        <input className="svg-input" data-testid="svg-connection-name" aria-label="Connection name" spellCheck={false}
          value={active.name} onChange={(e) => onName(e, p)} />
      </label>
      <Select label="Kind" testid="svg-connection-kind" value={active.kind}
        options={[["text", "Text generation (SVG)"], ["image", "Image generation"]]}
        onChange={(v) => p.onMeta({ kind: v as ConnectionKind })} />
      <button type="button" className="svg-btn" data-testid="svg-connection-add" title="Add a new Sunburst image connection" onClick={p.onAdd}>+ New</button>
      <button type="button" className="svg-btn" data-testid="svg-connection-remove" title="Remove this connection" disabled={p.connections.length <= 1} onClick={p.onRemove}>✕ Remove</button>
    </div>
  );
}

function onName(e: React.ChangeEvent<HTMLInputElement>, p: SvgConnectionsProps): void {
  p.onMeta({ name: e.target.value });
}

/** The image grid — mounted only while the active connection generates images. */
export function ImageSettingsGrid({ image, onImage }: { image: Connection["image"] | undefined; onImage: (patch: Partial<Connection["image"]>) => void }) {
  if (!image) return null;
  return (
    <div className="svg-image-grid" data-testid="svg-image-settings">
      <Select label="Quality" testid="svg-img-quality" value={image.quality}
        options={QUALITIES.map((q) => [q, q])} onChange={(v) => onImage({ quality: v as Connection["image"]["quality"] })} />
      <Select label="Size" testid="svg-img-size" value={image.sizePreset}
        options={SIZE_PRESETS.map((s) => [s, s === "custom" ? "custom W×H" : s === "auto" ? "auto" : s.replace("x", "×")])}
        onChange={(v) => onImage({ sizePreset: v as Connection["image"]["sizePreset"] })} />
      {image.sizePreset === "custom" && (
        <>
          <NumberField label="Width" testid="svg-img-w" value={image.customW} min={256} max={4096}
            onChange={(n) => onImage({ customW: clampCustomDim(n) })} />
          <NumberField label="Height" testid="svg-img-h" value={image.customH} min={256} max={4096}
            onChange={(n) => onImage({ customH: clampCustomDim(n) })} />
        </>
      )}
      <Select label="Images (n)" testid="svg-img-n" value={String(image.n)}
        options={Array.from({ length: IMAGE_N_MAX - IMAGE_N_MIN + 1 }, (_, i) => [String(i + IMAGE_N_MIN), String(i + IMAGE_N_MIN)])}
        onChange={(v) => onImage({ n: Number(v) })} />
      <Select label="Background" testid="svg-img-background" value={image.background}
        options={BACKGROUNDS.map((b) => [b, b])} onChange={(v) => onImage({ background: v as Connection["image"]["background"] })} />
      <Select label="Output format" testid="svg-img-format" value={image.outputFormat}
        options={IMAGE_FORMATS.map((f) => [f, f])} onChange={(v) => onImage({ outputFormat: v as Connection["image"]["outputFormat"] })} />
      <Select label="Response" testid="svg-img-response" value={image.responseFormat}
        options={RESPONSE_FORMATS.map((f) => [f, f === "b64_json" ? "b64_json (inline)" : "url"])}
        onChange={(v) => onImage({ responseFormat: v as Connection["image"]["responseFormat"] })} />
    </div>
  );
}
