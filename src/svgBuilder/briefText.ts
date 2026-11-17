// briefText.ts — the static, copy-ready implementation brief shown by "Prompt
// brief" / "Corrected brief". Like the reference, it describes the product and
// does not embed current settings, keys, prompts or image bytes.

export interface BriefSection { id: string; title: string; points: readonly string[] }

export const BRIEF_SECTIONS: readonly BriefSection[] = [
  { id: "intent", title: "Intent & scope", points: [
    "Build an icon sheet constructor inside the existing app as one tab; no second app or server.",
    "Inputs are only `.svg.json`-approved SVG icons discovered in every folder of the chosen root, read-only.",
    "Output is one editable, stroke-only SVG sheet (plus PNG 2× and a reproducible preset).",
  ] },
  { id: "prompt", title: "Structured prompt", points: [
    "Selection recipe: Similar (score = shared tags ÷ profile tags ≥ threshold, default 70 %), Random (seeded, whole library), Filtered (one category).",
    "Seeded Fisher–Yates draw; same seed, same sheet. Locked icons keep their cell; short pools are topped up from the library and reported.",
    "Containment chain: Artboard → free area (minus banner) → padded content → grid (shrink-only fit, centred) → icon box → glyph (box − 2.2 × stroke).",
    "Masthead: Left / Top / Bottom / Right / None; Solid or Split; title, subtitle, sizes, face, hero glyph, accent rule.",
  ] },
  { id: "decisions", title: "Decisions to confirm", points: [
    "Captions use the asset label; UPPERCASE or as written.",
    "Undo covers layout settings and placements on the app's single global timeline.",
    "Presets keep the user's banner copy and hero glyph.",
  ] },
  { id: "acceptance", title: "Acceptance & output", points: [
    "Every stroke stays inside its box at every grid size; overflow auto-fits and says so.",
    "Exports are verified (approved ids, unchanged fingerprints, valid SVG) before one atomic download.",
    "Empty-cell placeholders and lock buttons are preview-only and never exported.",
  ] },
];

export function briefMarkdown(): string {
  const body = BRIEF_SECTIONS.map((s, i) => `## ${i + 1}. ${s.title}\n${s.points.map((p) => `- ${p}`).join("\n")}`).join("\n\n");
  return `# Product brief — Icon Sheet Constructor\n\n${body}\n\nReturn a working implementation, not mockups.\n`;
}
