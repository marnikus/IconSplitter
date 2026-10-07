// minijpeg.ts — a minimal baseline JPEG with a given SOF size (RULE 8). The
// bytes are not a decodable photograph — they are a real SOI/SOF0/EOI frame the
// lib's JPEG readers parse for dimensions and XMP (readJpegDimensions,
// embedJpegMetadata, verifyJpeg all operate on segments, not pixels), so tests
// can stand in for the browser's canvas encoder without a codec.

/** A minimal baseline JPEG whose SOF0 declares `width` × `height`. */
export function minimalJpeg(width: number, height: number): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]);
}
