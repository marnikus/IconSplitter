// textoutline.ts — the browser text outliner (2026-11-17): the Local Font
// Access API lists the machine's own fonts (with the user's permission) and
// opentype.js turns a run's resolved family + weight into glyph paths. The
// outliner contract is SYNC, so the export runners warm the font cache first
// (`warmTextFonts`, an async step inside their own async stage); a run whose
// font is not in the cache answers null — expandtext refuses it by name.
// Outside a browser with Local Font Access there is no provider at all.
import opentype from "opentype.js";
import type { TextOutline, TextOutliner, TextRun } from "./expandtext";

interface LocalFont { family: string; style?: string; blob(): Promise<Blob> }
type QueryLocalFonts = () => Promise<LocalFont[]>;

const STYLE_WEIGHTS: [RegExp, number][] = [
  [/thin/i, 100], [/extralight|ultralight/i, 200], [/light/i, 300], [/medium/i, 500],
  [/semibold|demibold/i, 600], [/extrabold|ultrabold/i, 800], [/black|heavy/i, 900], [/bold/i, 700],
];
const weightOfStyle = (style: string): number => STYLE_WEIGHTS.find(([re]) => re.test(style))?.[1] ?? 400;

/** family|weight → parsed font; "missing" remembers a refusal without retrying it. */
const fonts = new Map<string, opentype.Font | "missing">();
let localFonts: Promise<LocalFont[]> | null = null;

function query(): Promise<LocalFont[]> {
  const api = (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  if (typeof api !== "function") return Promise.reject(new Error("no local font access"));
  localFonts = localFonts ?? api();
  return localFonts;
}

const candidatesOf = (family: string): string[] => family.split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter((part) => part !== "");

async function loadFont(family: string, weight: number): Promise<opentype.Font | null> {
  const key = `${family.toLowerCase()}|${weight}`;
  const cached = fonts.get(key);
  if (cached !== undefined) return cached === "missing" ? null : cached;
  let loaded: opentype.Font | "missing" = "missing";
  try {
    const list = await query();
    const ofFamily = list.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (ofFamily.length > 0) {
      const best = ofFamily.reduce((a, b) => (Math.abs(weightOfStyle(b.style ?? "") - weight) <= Math.abs(weightOfStyle(a.style ?? "") - weight) ? b : a));
      const buffer = await (await best.blob()).arrayBuffer();
      loaded = opentype.parse(buffer);
    }
  } catch { loaded = "missing"; }
  fonts.set(key, loaded);
  return loaded === "missing" ? null : loaded;
}

/** The run's glyph paths in run-local coordinates, kerned, letter-spacing included. */
function layout(font: opentype.Font, run: TextRun): TextOutline {
  let advance = 0;
  let d = "";
  for (const char of run.value) {
    d += `${font.getPath(char, advance, 0, run.size).toPathData(2)} `;
    advance += font.getAdvanceWidth(char, run.size) + run.letterSpacing;
  }
  const width = Math.max(0, advance - (run.value.length > 0 ? run.letterSpacing : 0));
  return { d: d.trim(), width };
}

function outlineSync(run: TextRun): TextOutline | null {
  for (const family of candidatesOf(run.family)) {
    const font = fonts.get(`${family.toLowerCase()}|${run.weight}`);
    if (font !== undefined && font !== "missing") return layout(font, run);
  }
  return null;
}

/** The sync provider, or null where this machine cannot outline fonts at all. */
export function browserTextOutliner(): TextOutliner | null {
  if (typeof (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts !== "function") return null;
  return outlineSync;
}

/**
 * Async warm-up for a document about to be expanded: every family a <text>
 * declares is resolved against the machine's fonts and parsed into the cache.
 * A no-op where there is no provider (tests, Node lanes).
 */
export async function warmTextFonts(svg: string): Promise<void> {
  if (browserTextOutliner() === null) return;
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const runs: { family: string; weight: number }[] = Array.from(root.getElementsByTagName("text")).map((el) => ({
    family: el.getAttribute("font-family") ?? "",
    weight: Number(el.getAttribute("font-weight") ?? 400) || 400,
  }));
  await Promise.all(runs.flatMap((run) => candidatesOf(run.family).map((family) => loadFont(family, run.weight))));
}
