// PathHint.tsx — the one line under a leaf-only path row (I-47). Both tabs
// share it so the gesture reads the same everywhere: copy the folder in
// Explorer, then paste, and the row shows the full path.

/** How to get the full path, shown while only the folder name is known. */
export default function PathHint({ testid }: { testid: string }) {
  return (
    <p className="pathhint" data-testid={testid}>
      Full path not captured — copy the folder in Explorer (Ctrl+Shift+C), then paste (Ctrl+V).
    </p>
  );
}
