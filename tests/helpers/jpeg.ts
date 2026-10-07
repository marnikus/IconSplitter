// jpeg.ts — a minimal but structurally real JPEG (SOI, APP0, SOF0, SOS, EOI).
// Real segment bytes are what lets the embed/read-back pair be tested without a
// browser encoder: jpegInfo() parses this exactly as it parses a canvas blob.

export function minimalJpeg(width: number, height: number): Uint8Array {
  const be = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...new TextEncoder().encode("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, ...be(height), ...be(width), 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0x00,
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}

/** The pixel size whose SOF matches the bytes: what a rasteriser would report. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  for (let i = 2; i + 9 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xc0) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
  }
  return null;
}
