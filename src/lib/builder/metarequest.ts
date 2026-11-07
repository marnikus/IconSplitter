// metarequest.ts — what the builder discloses to the provider, and in what shape
// (design §5.6, decided 2026-11-07).
//
// Q1: the builder sends NO image. The disclosed input is the composed sheet's own
// SVG source plus the effective prompt, as two text parts. That is a deliberate
// choice, not a limitation: the sheet IS the artwork, and its source is a more
// precise description of it than a screenshot would be — the model can read the
// grid, the captions and every path.
//
// Q2: the prompt, the parser, the validator and the tag rules are "SVG to upload"'s
// (lib/upload/meta), imported. This file owns only what is genuinely the builder's:
// the sheet's source, its character cap, its digest fallback, and the lines the
// confirmation dialog shows.
//
// The rule that matters most is the cap: the source is NEVER cut mid-document. A
// truncated `<svg>` is malformed XML and a misleading input, so over the cap the
// request switches to a deterministic structural digest — and the dialog says so in
// one line. A silent swap would be a lie about what was sent.

import { DEFAULT_METADATA_PROMPT } from "../upload/meta";
import type { GeminiTextRequest } from "../upload/gemini";
import { fnv1a32 } from "../pairing";

/** Above this the source is replaced by a digest. */
export const SVG_DISCLOSURE_MAX_CHARS = 60_000;

/** What the provider can be shown, and whether it is the real source. */
export type DisclosureMode = "svg" | "digest";

export interface Disclosure {
  mode: DisclosureMode;
  /** Characters actually sent (measured after compaction). */
  chars: number;
  /** How many icons the sheet carries — stated to the model and in the dialog. */
  icons: number;
  /** The dialog's lines, in order. Never empty, never a menu. */
  lines: string[];
}

export interface SheetMetaRequest {
  /** The exact body that will be POSTed — built here, shown, then sent unmodified. */
  body: GeminiTextRequest;
  disclosure: Disclosure;
}

/** One icon as the digest describes it (the sheet's own order). */
export interface DigestIcon {
  id: string;
  name: string;
  viewBox: string;
  paths: number;
  tags: readonly string[];
}

export interface SheetMetaArgs {
  prompt: string;
  sheetSvg: string;
  icons: readonly DigestIcon[];
  title: string;
  subtitle: string;
  config: { width: number; height: number; columns: number; rows: number };
}

/** The header the second part opens with: it names the input honestly. */
export function sourceHeader(icons: number): string {
  const count = icons === 1 ? "1 icon" : `${icons} icons`;
  return `Sheet SVG source (the artwork to describe): ${count}, composed by the user.`;
}

/** The digest's header: the same honesty, when the source is too long to send. */
export function digestHeader(icons: number): string {
  const count = icons === 1 ? "1 icon" : `${icons} icons`;
  return `Sheet digest (the sheet's SVG source was too long to send): ${count}, composed by the user.`;
}

/**
 * The compacted source: the XML prolog gone, whitespace BETWEEN tags collapsed.
 * Nothing inside an attribute or a text node is touched, so the document still
 * parses and still means the same thing.
 */
export function compactSheetSource(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

/** The deterministic structural summary that stands in for an over-long source. */
export function digestSourceOf(args: SheetMetaArgs): string {
  const { config } = args;
  const head = [
    `Sheet: ${config.width}×${config.height} px, grid ${config.columns}×${config.rows}.`,
    args.title === "" ? "No banner title." : `Title: ${args.title}.`,
    args.subtitle === "" ? "No subtitle." : `Subtitle: ${args.subtitle}.`,
  ];
  const cells = args.icons.map((icon, index) => {
    const tags = icon.tags.length === 0 ? "no tags" : icon.tags.join(", ");
    return `  ${index}: ${icon.id} · ${icon.name} · ${icon.viewBox} · ${icon.paths} path${icon.paths === 1 ? "" : "s"} · ${tags}`;
  });
  return [...head, `Cells (${args.icons.length}):`, ...cells].join("\n");
}

/** A short stable hash of the digest — what a record binds to when the source is long. */
export function digestOf(args: SheetMetaArgs): string {
  return fnv1a32(digestSourceOf(args)).toString(16).padStart(8, "0");
}

/** Builds the text-only request and the disclosure the confirmation dialog shows. */
export function buildSheetMetaRequest(args: SheetMetaArgs): SheetMetaRequest {
  const compact = compactSheetSource(args.sheetSvg);
  return compact.length <= SVG_DISCLOSURE_MAX_CHARS ? sourceRequest(args, compact) : digestRequest(args, compact);
}

/** The whole document fits: send it, and say how much of it goes. */
function sourceRequest(args: SheetMetaArgs, compact: string): SheetMetaRequest {
  const icons = args.icons.length;
  return {
    body: bodyOf(args.prompt, `${sourceHeader(icons)}\n${compact}`),
    disclosure: {
      mode: "svg",
      chars: compact.length,
      icons,
      lines: [
        `Sends the sheet's SVG source — ${icons} icon${plural(icons)}, ${compact.length.toLocaleString("en-US")} characters.`,
        "No image is sent, and no file leaves this device until you confirm.",
        "The rules and the validation are the same as SVG to upload.",
      ],
    },
  };
}

/** Too long to send whole: a digest, and the dialog says so in one line. */
function digestRequest(args: SheetMetaArgs, compact: string): SheetMetaRequest {
  const icons = args.icons.length;
  const text = `${digestHeader(icons)}\n${digestSourceOf(args)}`;
  return {
    body: bodyOf(args.prompt, text),
    disclosure: {
      mode: "digest",
      chars: text.length,
      icons,
      lines: [
        `The source is too long to send (${compact.length.toLocaleString("en-US")} characters, the limit is ${SVG_DISCLOSURE_MAX_CHARS.toLocaleString("en-US")}).`,
        `A structural digest is sent instead — ${icons} icon${plural(icons)}, ${text.length.toLocaleString("en-US")} characters.`,
        "The source is never cut in half, so the provider always receives a whole document.",
      ],
    },
  };
}

/** "icon" vs "icons". */
function plural(count: number): string {
  return count === 1 ? "" : "s";
}

/** Two text parts: the prompt, then the artwork. Nothing else, ever. */
function bodyOf(prompt: string, artwork: string): GeminiTextRequest {
  return { contents: [{ role: "user", parts: [{ text: prompt }, { text: artwork }] }] };
}

/**
 * Which inputs bind a metadata record to a sheet: the described CONTENT (grid, banner
 * words, the ordered icons with their captions) — deliberately NOT the raw source,
 * so re-formatting the same sheet does not mark every record stale.
 */
export function sheetMetaFingerprint(args: SheetMetaArgs): string {
  const content = JSON.stringify({
    w: args.config.width,
    h: args.config.height,
    c: args.config.columns,
    r: args.config.rows,
    t: args.title.trim(),
    s: args.subtitle.trim(),
    icons: args.icons.map((icon) => [icon.id, icon.name, icon.viewBox, icon.paths, [...icon.tags].sort()]),
  });
  return fnv1a32(content).toString(16).padStart(8, "0");
}

/** The default prompt is upload's — exported so the panel can state that it is. */
export const BUILDER_META_PROMPT = DEFAULT_METADATA_PROMPT;
