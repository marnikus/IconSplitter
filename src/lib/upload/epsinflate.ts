// epsinflate.ts — pure synchronous TypeScript RFC 1950 (zlib + Adler-32) +
// RFC 1951 (stored, fixed-Huffman, dynamic-Huffman DEFLATE) + PostScript ASCII85
// decoder so browser & Node runtime verifiers inspect every compressed byte of
// `%AI9_DataStream` (including files written by Adobe Illustrator 30.x itself).

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface BitReader { src: Uint8Array; pos: number; buf: number; bits: number }
interface HuffTree { counts: Int32Array; symbols: Int32Array; maxBits: number }

const FIXED_LIT = buildTree(fixedLitLengths());
const FIXED_DIST = buildTree(new Array<number>(32).fill(5));

/** Decode `%`-prefixed ASCII85 + RFC 1950 zlib `%AI9_DataStream` lines into Latin-1/UTF-8 text. */
export function decodeAiDataStream(encoded: string): string {
  const body = encoded
    .split(/\r\n|\r|\n/)
    .map((line) => (line.startsWith("%") ? line.slice(1) : line))
    .join("");
  const end = body.indexOf("~>");
  const packed = ascii85Decode(end >= 0 ? body.slice(0, end) : body);
  const raw = zlibDecompress(packed);
  return new TextDecoder("utf-8", { fatal: false }).decode(raw);
}

/** Standard PostScript ASCII85 decoder (`!'..'u'`, `'z'` zero tuple). */
export function ascii85Decode(text: string): Uint8Array {
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    [tuple, count] = stepAscii85(text.charCodeAt(i), tuple, count, out);
  }
  finishAscii85(tuple, count, out);
  return Uint8Array.from(out);
}

function stepAscii85(code: number, tuple: number, count: number, out: number[]): [number, number] {
  if (code <= 32) return [tuple, count];
  if (code === 122 && count === 0) { out.push(0, 0, 0, 0); return [0, 0]; }
  if (code < 33 || code > 117) throw new Error("invalid ASCII85 character");
  const next = tuple * 85 + (code - 33);
  if (count + 1 < 5) return [next, count + 1];
  pushWord(out, next, 4);
  return [0, 0];
}

function finishAscii85(tuple: number, count: number, out: number[]): void {
  if (count === 1) throw new Error("truncated ASCII85 tuple");
  if (count === 0) return;
  let padded = tuple;
  for (let i = count; i < 5; i++) padded = padded * 85 + 84;
  pushWord(out, padded, count - 1);
}

/** RFC 1950 zlib wrapper check + RFC 1951 full DEFLATE inflater + Adler-32 check. */
export function zlibDecompress(data: Uint8Array): Uint8Array {
  if (data.length < 6) throw new Error("zlib stream too short");
  const cmf = data[0];
  const flg = data[1];
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) + flg) % 31 !== 0 || (flg & 0x20) !== 0) {
    throw new Error("invalid zlib header");
  }
  const br: BitReader = { src: data, pos: 2, buf: 0, bits: 0 };
  const out: number[] = [];
  let final = 0;
  while (final === 0) {
    final = readBits(br, 1);
    inflateBlock(br, readBits(br, 2), out);
  }
  const raw = Uint8Array.from(out);
  const expected = readBigEndian32(data, data.length - 4);
  if (adler32Of(raw) !== expected) throw new Error("zlib Adler-32 checksum mismatch");
  return raw;
}

function inflateBlock(br: BitReader, type: number, out: number[]): void {
  if (type === 0) { storedBlock(br, out); return; }
  if (type === 1) { huffmanBlock(br, FIXED_LIT, FIXED_DIST, out); return; }
  if (type === 2) {
    const [lit, dist] = dynamicTrees(br);
    huffmanBlock(br, lit, dist, out);
    return;
  }
  throw new Error("invalid DEFLATE block type");
}

function storedBlock(br: BitReader, out: number[]): void {
  br.buf = 0;
  br.bits = 0;
  if (br.pos + 4 > br.src.length) throw new Error("truncated stored DEFLATE header");
  const len = br.src[br.pos] | (br.src[br.pos + 1] << 8);
  const nlen = br.src[br.pos + 2] | (br.src[br.pos + 3] << 8);
  br.pos += 4;
  if ((len ^ 0xffff) !== nlen || br.pos + len > br.src.length) throw new Error("corrupt stored DEFLATE block");
  for (let i = 0; i < len; i++) out.push(br.src[br.pos++]);
}

function dynamicTrees(br: BitReader): [HuffTree, HuffTree] {
  const hlit = readBits(br, 5) + 257;
  const hdist = readBits(br, 5) + 1;
  const hclen = readBits(br, 4) + 4;
  const clLens = new Array<number>(19).fill(0);
  for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = readBits(br, 3);
  const lengths = readCodeLengths(br, buildTree(clLens), hlit + hdist);
  return [buildTree(lengths.slice(0, hlit)), buildTree(lengths.slice(hlit))];
}

function readCodeLengths(br: BitReader, clTree: HuffTree, total: number): number[] {
  const lens: number[] = [];
  while (lens.length < total) {
    const sym = decodeSym(br, clTree);
    if (sym < 16) lens.push(sym);
    else repeatLength(br, sym, lens);
  }
  return lens;
}

function repeatLength(br: BitReader, sym: number, lens: number[]): void {
  if (sym === 16) {
    if (lens.length === 0) throw new Error("invalid repeat code 16");
    const prev = lens[lens.length - 1];
    for (let n = readBits(br, 2) + 3; n > 0; n--) lens.push(prev);
  } else {
    const zeros = sym === 17 ? readBits(br, 3) + 3 : readBits(br, 7) + 11;
    for (let n = zeros; n > 0; n--) lens.push(0);
  }
}

function huffmanBlock(br: BitReader, litTree: HuffTree, distTree: HuffTree, out: number[]): void {
  for (;;) {
    const sym = decodeSym(br, litTree);
    if (sym === 256) return;
    if (sym < 256) out.push(sym);
    else copyBackRef(br, sym - 257, distTree, out);
  }
}

function copyBackRef(br: BitReader, lenIdx: number, distTree: HuffTree, out: number[]): void {
  const length = LEN_BASE[lenIdx] + readBits(br, LEN_EXTRA[lenIdx]);
  const distIdx = decodeSym(br, distTree);
  const dist = DIST_BASE[distIdx] + readBits(br, DIST_EXTRA[distIdx]);
  if (dist > out.length) throw new Error("DEFLATE distance past start of output");
  for (let i = 0; i < length; i++) out.push(out[out.length - dist]);
}

function buildTree(lengths: number[]): HuffTree {
  const counts = new Int32Array(16);
  let maxBits = 0;
  for (const len of lengths) {
    if (len > 0) { counts[len]++; if (len > maxBits) maxBits = len; }
  }
  const offsets = new Int32Array(16);
  for (let bits = 1; bits < 15; bits++) offsets[bits + 1] = offsets[bits] + counts[bits];
  const symbols = new Int32Array(lengths.length);
  for (let sym = 0; sym < lengths.length; sym++) {
    if (lengths[sym] > 0) symbols[offsets[lengths[sym]]++] = sym;
  }
  return { counts, symbols, maxBits };
}

function decodeSym(br: BitReader, tree: HuffTree): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= tree.maxBits; len++) {
    code |= readBits(br, 1);
    const count = tree.counts[len];
    if (code - count < first) return tree.symbols[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Error("unmatched Huffman code");
}

function readBits(br: BitReader, count: number): number {
  if (count === 0) return 0;
  while (br.bits < count) {
    if (br.pos >= br.src.length) throw new Error("unexpected end of DEFLATE stream");
    br.buf |= br.src[br.pos++] << br.bits;
    br.bits += 8;
  }
  const val = br.buf & ((1 << count) - 1);
  br.buf >>>= count;
  br.bits -= count;
  return val;
}

function fixedLitLengths(): number[] {
  const out = new Array<number>(288);
  for (let i = 0; i <= 143; i++) out[i] = 8;
  for (let i = 144; i <= 255; i++) out[i] = 9;
  for (let i = 256; i <= 279; i++) out[i] = 7;
  for (let i = 280; i <= 287; i++) out[i] = 8;
  return out;
}

function pushWord(out: number[], val: number, bytes: number): void {
  const all = [(val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff];
  for (let i = 0; i < bytes; i++) out.push(all[i]);
}

function readBigEndian32(data: Uint8Array, at: number): number {
  return (((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]) >>> 0);
}

function adler32Of(src: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < src.length; i++) {
    a = (a + src[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
