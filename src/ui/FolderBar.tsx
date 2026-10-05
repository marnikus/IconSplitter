// FolderBar.tsx — the folder control Selection V2 and Generate SVG share
// (design 2026-10-05-folder-ui). It owns exactly two things: the ONE action that
// opens the folder dialog, and the read-only row that states the full path the
// pick captured (I-35/I-36).
//
// Why this shape: the browser is told only the picked folder's NAME, so the
// name is a fact about the scan — never a button label, and the path is never a
// field to type into (the paste field, "Use copied path" and every copied-path
// status were removed by request). The row appears only once a path is known,
// and it is plain text: what the app knows, stated, with nothing to press.

/** The one way to open a folder, in either tab. */
export function OpenFolderButton({ testid, onClick }: { testid: string; onClick: () => void }) {
  return (
    <button type="button" className="folder-open" data-testid={testid} onClick={onClick}>
      Open folder
    </button>
  );
}

/** The picked folder's complete path, below the controls. Nothing while unknown. */
export function RootPathRow({ testid, path }: { testid: string; path: string }) {
  if (path === "") return null;
  return (
    <p className="folder-path" data-testid={testid} title={path}>
      {path}
    </p>
  );
}
