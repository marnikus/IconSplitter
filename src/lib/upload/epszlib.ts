// epszlib.ts — pure synchronous TypeScript RFC 1950 (zlib) + RFC 1951 (DEFLATE
// fixed-Huffman + LZ77) + PostScript ASCII85 encoder for Adobe Illustrator 10
// `%AI9_DataStream` private vector streams. Zero external dependencies, works
// identically in browsers, single-file `dist/index.html`, and Node.

export { ascii85Decode, decodeAiDataStream, zlibDecompress } from "./epsinflate";

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

interface BitWriter {
  out: number[];
  buf: number;
  bits: number;
}

/** Compress UTF-8/ASCII text as `%`-prefixed Clean7Bit `%AI9_DataStream` CRLF lines (`<= 67` bytes/line). */
export function encodeAiDataStream(text: string): string {
  const raw = new TextEncoder().encode(text);
  const body = ascii85Encode(zlibCompress(raw)).slice(0, -2);
  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) lines.push(`%${body.slice(i, i + 64)}`);
  if (lines.length === 0) return "%~>";
  lines[lines.length - 1] += "~>";
  return lines.join("\r\n");
}

/** RFC 1950 zlib wrapper (`0x78 0x9C`) + RFC 1951 fixed-Huffman stream + Adler-32. */
export function zlibCompress(src: Uint8Array): Uint8Array {
  const bw: BitWriter = { out: [0x78, 0x9c], buf: 0, bits: 0 };
  writeBits(bw, 1, 1); // BFINAL = 1
  writeBits(bw, 1, 2); // BTYPE = 01 (fixed Huffman)
  deflateBody(bw, src);
  writeSym(bw, 256); // end-of-block
  if (bw.bits > 0) bw.out.push(bw.buf & 0xff);
  const sum = adler32(src);
  bw.out.push((sum >>> 24) & 0xff, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff);
  return Uint8Array.from(bw.out);
}

function deflateBody(bw: BitWriter, src: Uint8Array): void {
  const head = new Int32Array(4096).fill(-1);
  const prev = new Int32Array(src.length).fill(-1);
  let i = 0;
  while (i < src.length) {
    const match = findMatch(src, i, head, prev);
    if (match === null) {
      writeSym(bw, src[i++]);
    } else {
      emitMatch(bw, match.len, match.dist);
      for (let k = 1; k < match.len && i + k + 2 < src.length; k++) insertHash(src, i + k, head, prev);
      i += match.len;
    }
  }
}

function insertHash(src: Uint8Array, pos: number, head: Int32Array, prev: Int32Array): number {
  const h = ((src[pos] << 8) ^ (src[pos + 1] << 4) ^ src[pos + 2]) & 4095;
  const first = head[h];
  prev[pos] = first;
  head[h] = pos;
  return first;
}

function findMatch(src: Uint8Array, pos: number, head: Int32Array, prev: Int32Array): { len: number; dist: number } | null {
  if (pos + 2 >= src.length) return null;
  const maxLen = Math.min(258, src.length - pos);
  let best: { len: number; dist: number } | null = null;
  for (let steps = 0, cand = insertHash(src, pos, head, prev); steps < 24 && isNear(pos, cand); steps++, cand = prev[cand]) {
    const len = spanMatch(src, cand, pos, maxLen);
    if (len >= 3 && (best === null || len > best.len)) best = { len, dist: pos - cand };
    if (len === maxLen) break;
  }
  return best;
}

function isNear(pos: number, cand: number): boolean {
  return cand >= 0 && pos - cand <= 32768;
}

function spanMatch(src: Uint8Array, a: number, b: number, maxLen: number): number {
  let len = 0;
  while (len < maxLen && src[a + len] === src[b + len]) len++;
  return len;
}

function emitMatch(bw: BitWriter, len: number, dist: number): void {
  const li = slotIndex(LEN_BASE, len);
  writeSym(bw, 257 + li);
  if (LEN_EXTRA[li] > 0) writeBits(bw, len - LEN_BASE[li], LEN_EXTRA[li]);
  const di = slotIndex(DIST_BASE, dist);
  writeRev(bw, di, 5);
  if (DIST_EXTRA[di] > 0) writeBits(bw, dist - DIST_BASE[di], DIST_EXTRA[di]);
}

function slotIndex(table: number[], val: number): number {
  let idx = 0;
  while (idx + 1 < table.length && table[idx + 1] <= val) idx++;
  return idx;
}

function writeSym(bw: BitWriter, sym: number): void {
  if (sym <= 143) writeRev(bw, 0x30 + sym, 8);
  else if (sym <= 255) writeRev(bw, 0x190 + (sym - 144), 9);
  else if (sym <= 279) writeRev(bw, sym - 256, 7);
  else writeRev(bw, 0xc0 + (sym - 280), 8);
}

function writeBits(bw: BitWriter, val: number, count: number): void {
  bw.buf |= val << bw.bits;
  bw.bits += count;
  while (bw.bits >= 8) {
    bw.out.push(bw.buf & 0xff);
    bw.buf >>>= 8;
    bw.bits -= 8;
  }
}

function writeRev(bw: BitWriter, code: number, width: number): void {
  let rev = 0;
  for (let i = 0; i < width; i++) rev = (rev << 1) | ((code >>> i) & 1);
  writeBits(bw, rev, width);
}

function adler32(src: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < src.length; i++) {
    a = (a + src[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Standard PostScript ASCII85 encoding (`!'..'u'`, `'z'` zero shorthand, `'~>'`). */
export function ascii85Encode(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i += 4) {
    const rem = Math.min(4, data.length - i);
    const val = (((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0)) >>> 0;
    if (rem === 4 && val === 0) out += "z";
    else out += base85Tuple(val, rem + 1);
  }
  return `${out}~>`;
}

function base85Tuple(val: number, chars: number): string {
  const digits = [0, 0, 0, 0, 0];
  let cur = val;
  for (let k = 4; k >= 0; k--) {
    digits[k] = (cur % 85) + 33;
    cur = Math.floor(cur / 85);
  }
  return String.fromCharCode(...digits.slice(0, chars));
}
