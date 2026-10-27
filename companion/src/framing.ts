const MAX_FRAME = 512 * 1024;
export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (body.length > MAX_FRAME) throw new Error("Invalid frame size");
  const prefix = Buffer.alloc(4); prefix.writeUInt32LE(body.length);
  return Buffer.concat([prefix, body]);
}
export function decodeFrames(input: Buffer): { messages: unknown[]; rest: Buffer } {
  const messages: unknown[] = []; let at = 0;
  while (input.length - at >= 4) {
    const size = input.readUInt32LE(at);
    if (size === 0 || size > MAX_FRAME) throw new Error("Invalid frame size");
    if (input.length - at - 4 < size) break;
    messages.push(JSON.parse(input.subarray(at + 4, at + size + 4).toString("utf8")));
    at += size + 4;
  }
  return { messages, rest: input.subarray(at) };
}
