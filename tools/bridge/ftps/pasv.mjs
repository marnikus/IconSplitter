// pasv.mjs — parses EPSV (229) and PASV (227) replies into a safe passive data port.
// Always connects to the control channel's own host to prevent FTP bounce / SSRF.

import { FtpsError } from "./reply.mjs";

export function parseEpsvPort(text) {
  const m = /\(\|\|\|(\d{1,5})\|\)/.exec(text);
  if (!m) return null;
  const port = Number(m[1]);
  return port >= 1 && port <= 65535 ? port : null;
}

export function parsePasvPort(text) {
  const m = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(text);
  if (!m) return null;
  const port = Number(m[5]) * 256 + Number(m[6]);
  return port >= 1 && port <= 65535 ? port : null;
}

export async function negotiatePassivePort(sendCmd, timeoutMs) {
  const epsv = await sendCmd("EPSV", timeoutMs);
  if (epsv.code === 229) {
    const port = parseEpsvPort(epsv.text);
    if (port !== null) return port;
  }
  const pasv = await sendCmd("PASV", timeoutMs);
  if (pasv.code === 227) {
    const port = parsePasvPort(pasv.text);
    if (port !== null) return port;
  }
  throw new FtpsError("ftp", `passive mode refused (${pasv.text || epsv.text})`);
}
