// EPS Photoshop resource comments, ASCII hex only, no executable PostScript.
import type { IconMetadata } from "./meta";
import { iptcResource, readPhotoshopIptc } from "./photoshop";
const BEGIN = "% IconSplitter IPTC begin";
const END = "% IconSplitter IPTC end";
const BLOCK = /^% IconSplitter IPTC begin(?:\r\n|\r|\n)[\s\S]*?^% IconSplitter IPTC end(?:\r\n|\r|\n|$)/gm;
export function stripEpsIptc(eps: string): string {
  return eps.replace(BLOCK, "");
}
export function embedIptcInEps(eps: string, meta: IconMetadata): string {
  const clean = stripEpsIptc(eps);
  const eol = /\r\n|\n|\r/.exec(clean)?.[0] ?? "\n";
  const hex = Array.from(iptcResource(meta), (b) => b.toString(16).padStart(2, "0")).join("");
  const lines = hex.match(/.{1,64}/g) ?? [];
  const block = [BEGIN, "%%BeginPhotoshop: 6", ...lines.map((l) => `% ${l}`), "%%EndPhotoshop", END, ""].join(eol);
  const at = clean.indexOf(eol) + eol.length;
  return `${clean.slice(0, at)}${block}${clean.slice(at)}`;
}
export function readEpsIptc(eps: string): IconMetadata | null {
  const blocks = eps.match(/^%%BeginPhotoshop:[^\r\n]*(?:\r\n|\r|\n)(?:% [0-9a-f]+(?:\r\n|\r|\n))+%%EndPhotoshop/gm);
  if (blocks?.length !== 1) return null;
  const hex = blocks[0].split(/\r\n|\r|\n/).slice(1, -1).map((l) => l.slice(2)).join("");
  if (hex.length % 2 !== 0) return null;
  return readPhotoshopIptc(Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16)));
}
