// name.ts — how a library icon is called, in the words a sheet caption can use.
// The pair's `base` is the artwork's own name; the app's `_AI` marker is
// bookkeeping (lib/upload/export trimArtifactStem makes the same distinction for
// export files). Pure: no disk, no metadata, no guessing beyond the name itself.

/** `icon-bunny-face` → `icon bunny face`; `chat_bot_2` → `chat bot 2`; "" stays "". */
export function nameOf(base: string): string {
  return base
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The words of a name — the search tokens a nameless pair can still offer. */
export function nameTokens(name: string): string[] {
  return name.split(" ").filter((word) => word !== "");
}
