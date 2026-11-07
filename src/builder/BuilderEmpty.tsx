// BuilderEmpty.tsx — the two honest states of the SVG builder before a sheet can
// exist: this browser has no File System Access API, or no folder has been picked
// yet. Both are stated with their own words and their own action (RULE 4): an empty
// library is never painted as an error, and a missing button is never a dead end.

import { OpenFolderButton } from "../ui/FolderBar";

/** No `showDirectoryPicker`: say so once, with the browser the app needs. */
export function BuilderUnsupported({ onPick }: { onPick: () => void }) {
  return (
    <div className="bld-empty" data-testid="builder-unsupported">
      <p className="bld-empty-title">This browser cannot open folders</p>
      <p className="bld-empty-note">
        The SVG builder reads approved SVG files from a folder on your disk, which needs the File
        System Access API. Open this app in Chrome or Edge on a desktop.
      </p>
      <button type="button" className="bld-link" onClick={onPick}>Try the folder picker anyway</button>
    </div>
  );
}

/** A supported browser with nothing picked yet. */
export function BuilderPickRoot({ onPick }: { onPick: () => void }) {
  return (
    <div className="bld-empty" data-testid="builder-root-empty">
      <p className="bld-empty-title">Pick the folder of approved icons</p>
      <p className="bld-empty-note">
        The builder lists only icons whose item is approved and whose SVG file is valid — the same
        rule the “SVG to upload” tab uses. Nothing is generated or changed on disk.
      </p>
      <OpenFolderButton testid="builder-open-folder-empty" onClick={onPick} />
    </div>
  );
}
