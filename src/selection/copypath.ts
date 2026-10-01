// copypath.ts — the honest "Open in File Explorer" fallback (RULE 9), shared
// by both Selection surfaces: a browser cannot launch Explorer, so the action
// copies the absolute path and says exactly that instead of failing silently.

import { fullPathText } from "./handles";

export async function copyPathText(
  rootName: string, relPath: string, say: (msg: string, err?: boolean) => void,
): Promise<void> {
  const text = fullPathText(rootName, relPath);
  try {
    await navigator.clipboard.writeText(text);
    say(`Path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    say("Could not copy the path", true);
  }
}
