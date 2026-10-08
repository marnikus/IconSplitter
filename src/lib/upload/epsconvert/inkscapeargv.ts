// inkscapeargv.ts — Inkscape CLI argv (D4): version parse and the 1.x vs
// 0.92 flag sets. Pure; the host owns temp files and spawn.

export interface InkscapeVersion { major: number; minor: number }
export interface InkscapePaths { input: string; output: string }

const SHARED = ["--export-area-page", "--export-text-to-path"];

/** `inkscape --version` stdout → {major, minor}; unparseable → null (no guess). */
export function parseInkscapeVersion(text: string): InkscapeVersion | null {
  const m = /Inkscape\s+(\d+)\.(\d+)/i.exec(text);
  return m === null ? null : { major: Number(m[1]), minor: Number(m[2]) };
}

/** Argv after the binary: 1.x `--export-filename` vs 0.92 `--export-eps`. */
export function inkscapeArgv(version: InkscapeVersion, paths: InkscapePaths): string[] {
  if (version.major >= 1) {
    return [`--export-filename=${paths.output}`, "--export-type=eps", ...SHARED, "--export-ps-level=3", paths.input];
  }
  return ["--without-gui", `--export-eps=${paths.output}`, ...SHARED, paths.input];
}
