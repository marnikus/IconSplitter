// fakejpeg.ts — a minimal structurally valid JPEG (SOI, SOF0 with real
// dimensions, EOI) for suites that need bytes the pipeline will accept
// without rendering anything (RULE 8: never real pixels in tests).
export function fakeJpeg(w: number, h: number): Uint8Array {
  // SOF0 payload: precision, height, width, 1 component, component spec.
  const payload = [8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 1, 1, 0x11, 0x00];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, (len >> 8) & 0xff, len & 0xff, ...payload, 0xff, 0xd9]);
}
