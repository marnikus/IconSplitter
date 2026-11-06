// UploadRowBadgeSettings.tsx — catalog popup: add, rename, recolour, remove (I-79).
import { useEffect, useState } from "react";
import { nextBadgeColor, type RowBadge, type RowBadgeState } from "../lib/upload/rowbadge";

export interface RowBadgeSettingsProps {
  state: RowBadgeState;
  onAdd: (name: string, color?: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function UploadRowBadgeSettings(p: RowBadgeSettingsProps) {
  return (
    <div className="svg-backdrop" data-testid="upload-rowbadge-backdrop" onClick={p.onClose}>
      <section className="svg-modal narrow" role="dialog" aria-modal="true" aria-labelledby="upload-rowbadge-title"
        data-testid="upload-rowbadge-dialog" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}>
        <header className="svg-modal-head">
          <h2 id="upload-rowbadge-title">Badges</h2>
          <button type="button" className="svg-btn tiny" data-testid="upload-rowbadge-close" onClick={p.onClose}>Close</button>
        </header>
        <div className="svg-modal-body">
          <p className="svg-note">Named colours for upload rows. Apply one or more to an icon, or to the selection.</p>
          <AddRow onAdd={p.onAdd} nextColor={nextBadgeColor(p.state.catalog)} />
          <ul className="up-rowbadge-list">
            {p.state.catalog.map((badge) => <BadgeRow key={badge.id} badge={badge} p={p} />)}
          </ul>
          {p.state.catalog.length === 0 && <p className="svg-note" data-testid="upload-rowbadge-empty">No badges yet — add a name to start.</p>}
        </div>
      </section>
    </div>
  );
}

function AddRow({ onAdd, nextColor }: { onAdd: (name: string, color?: string) => void; nextColor: string }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(nextColor);
  const add = () => {
    onAdd(name, color);
    setName("");
    setColor(nextColor);
  };
  return (
    <div className="up-rowbadge-add">
      <input className="svg-input" data-testid="upload-rowbadge-new-name" aria-label="New badge name"
        placeholder="Badge name" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
      <input type="color" data-testid="upload-rowbadge-new-color" aria-label="New badge colour"
        value={color} onChange={(e) => setColor(e.target.value)} />
      <button type="button" className="svg-btn primary" data-testid="upload-rowbadge-add" onClick={add}>Add badge</button>
    </div>
  );
}

function BadgeRow({ badge, p }: { badge: RowBadge; p: RowBadgeSettingsProps }) {
  const [name, setName] = useState(badge.name);
  useEffect(() => { setName(badge.name); }, [badge.name]);
  const commit = () => {
    const trimmed = name.trim();
    if (trimmed === "") { setName(badge.name); return; }
    if (trimmed !== badge.name) p.onRename(badge.id, trimmed);
  };
  return (
    <li className="up-rowbadge-edit" data-testid={`upload-rowbadge-item-${badge.id}`}>
      <input type="color" data-testid={`upload-rowbadge-color-${badge.id}`} aria-label={`Colour for ${badge.name}`}
        value={badge.color} onChange={(e) => p.onRecolor(badge.id, e.target.value)} />
      <input className="svg-input" data-testid={`upload-rowbadge-name-${badge.id}`} aria-label={`Name for ${badge.name}`}
        value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
      <button type="button" className="svg-btn tiny danger" data-testid={`upload-rowbadge-remove-${badge.id}`}
        onClick={() => p.onRemove(badge.id)}>Remove</button>
    </li>
  );
}
