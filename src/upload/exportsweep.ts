// exportsweep.ts — the export folder's own housekeeping (2026-10-08).
//
// A folder exported before the naming change still carries the OLD artifacts
// (`fog_AI.eps` beside `fog.svg` / `fog.jpg`), and the package must end up under
// ONE name. After a package is committed the sweep removes the files this app
// provably wrote and no longer writes — and nothing else:
//
// * only inside the icon's own export folder, and only the three artifact
//   extensions (`ARTIFACT_EXTS`): `export.json`, a readme, another icon's
//   `arch_AI.svg`, a NUMBER-TAILED name that belongs to a different pair
//   (`fog_AI_7.eps` is icon `fog_7`'s, whose own artifacts are `fog_7.*`), or a
//   near-miss base (`fogv2.eps`, `fog_AI_x.eps`) are never candidates;
// * never the current names themselves, so a re-export of an already-named
//   package removes nothing;
// * a superseded file the previous `export.json` NAMES is removed only when the
//   CURRENT artifact of that kind is on disk (this run wrote it, or an earlier
//   run under the new name did): it is the last copy of a live output, and a
//   failed EPS stage must not delete the previous EPS;
// * a superseded file NO record names is an orphan — the app lost track of it,
//   no package claims it, and it is exactly what a rename leaves behind — so it
//   goes. That is the real-folder case this exists for: `fog.svg` + `fog.jpg`
//   + the old `fog_AI.eps`.
//
// A crash-leftover `*.tmp` is left alone: the commit removes its own, and the
// sweep does not guess. Reported, never silent: the caller names what went.

import { listChildNames, type DirHandleLike } from "../lib/fs";
import { ARTIFACT_EXTS, trimArtifactStem } from "../lib/upload/export";

/**
 * Removes this icon's superseded artifacts; returns the names that went.
 * `named` is what the previous `export.json` claims (file names, not paths).
 */
export async function sweepSuperseded(
  dir: DirHandleLike, stem: string, named: ReadonlySet<string>,
): Promise<string[]> {
  const present = new Set(await listChildNames(dir));
  const removed: string[] = [];
  for (const name of present) {
    if (!candidate(name, stem) || !removable(name, stem, present, named)) continue;
    try {
      await dir.removeEntry?.(name);
      removed.push(name);
    } catch {
      // a file the browser refuses to remove is left in place, never hidden
    }
  }
  return removed;
}

/** Ours and superseded: our bookkeeping in the name, and not the current artifact. */
function candidate(name: string, stem: string): boolean {
  const ext = extOf(name);
  if (!isArtifactExt(ext)) return false;
  return name !== `${stem}.${ext}` && owns(name, stem);
}

/** Never the last copy of an output the package still claims; an orphan goes. */
function removable(
  name: string, stem: string, present: ReadonlySet<string>, named: ReadonlySet<string>,
): boolean {
  return !named.has(name) || present.has(`${stem}.${extOf(name)}`);
}

/** Our own bookkeeping: the name trims to this icon's stem under the export rule. */
function owns(name: string, stem: string): boolean {
  const bare = name.slice(0, name.lastIndexOf("."));
  return bare !== stem && trimArtifactStem(bare) === stem;
}

function extOf(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

function isArtifactExt(ext: string): boolean {
  return (ARTIFACT_EXTS as readonly string[]).includes(ext);
}
