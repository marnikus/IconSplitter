// UploadModal.tsx — the one dialog shell the upload tab uses (design §2): a
// backdrop, a titled panel, and a Close button. Deliberately tiny and
// behaviour-free — Preview and Edit settings are two different tools, and the
// only thing they should share is how they appear and how they close.

import type { ReactNode } from "react";

export function Modal({ title, testid, onClose, children }: {
  title: string; testid: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="up-modal-backdrop" onClick={onClose} data-testid={`${testid}-backdrop`}>
      <div className="up-modal" role="dialog" aria-label={title} data-testid={testid} onClick={(e) => e.stopPropagation()}>
        <div className="up-modal-head">
          <h3>{title}</h3>
          <button className="svg-btn ghost" data-testid={`${testid}-x`} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
