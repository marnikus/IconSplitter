/* global DOMParser, TextDecoder */
// Deliberately independent of the app: parses file bytes, not caches/sidecars.
const text = (b) => new TextDecoder("utf-8", { fatal: true }).decode(b);
const ascii = (b) => new TextDecoder("latin1").decode(b);
const number = (b, at, n) => {
  if (at + n > b.length) throw new Error("Truncated metadata length");
  let value = 0;
  for (let i = 0; i < n; i++) value = value * 256 + b[at + i];
  return value;
};
function xmpMetadata(xml) {
  const packet = xml.match(/<\?xpacket begin=[\s\S]*?<\?xpacket end=[^?]*\?>/)?.[0];
  if (!packet) return null;
  const doc = new DOMParser().parseFromString(packet, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Malformed XMP XML");
  const elements = Array.from(doc.getElementsByTagName("*"));
  const dc = (name) => elements.find((el) => el.namespaceURI === "http://purl.org/dc/elements/1.1/" && el.localName === name);
  const title = dc("title")?.textContent;
  const description = dc("description")?.textContent;
  const tags = Array.from(dc("subject")?.getElementsByTagName("*") ?? []).filter((el) => el.namespaceURI === "http://www.w3.org/1999/02/22-rdf-syntax-ns#" && el.localName === "li").map((el) => el.textContent);
  return title && description && tags.length ? { title, description, tags } : null;
}
function iimMetadata(b) {
  const fields = new Map();
  for (let at = 0; at < b.length;) {
    if (b[at] !== 28 || at + 5 > b.length) throw new Error("Invalid IPTC dataset");
    const size = number(b, at + 3, 2);
    if (size >= 32768 || at + 5 + size > b.length) throw new Error("Truncated IPTC dataset");
    const id = `${b[at + 1]}:${b[at + 2]}`;
    fields.set(id, [...(fields.get(id) ?? []), b.slice(at + 5, at + 5 + size)]);
    at += 5 + size;
  }
  if (text(fields.get("1:90")?.[0] ?? new Uint8Array()) !== "\u001b%G") throw new Error("IPTC charset is not UTF-8");
  const first = (id) => text(fields.get(`2:${id}`)?.[0] ?? new Uint8Array());
  return { title: first(105) || first(5), description: first(120), tags: (fields.get("2:25") ?? []).map(text) };
}
function photoshopMetadata(b) {
  let result = null;
  for (let at = 0; at < b.length;) {
    if (ascii(b.slice(at, at + 4)) !== "8BIM") throw new Error("Invalid Photoshop resource");
    const id = number(b, at + 4, 2);
    const nameSize = b[at + 6] + 1;
    at += 6 + nameSize + nameSize % 2;
    const size = number(b, at, 4);
    at += 4;
    if (at + size + size % 2 > b.length) throw new Error("Truncated Photoshop resource");
    if (id === 1028) {
      if (result) throw new Error("Multiple IPTC records");
      result = iimMetadata(b.slice(at, at + size));
    }
    at += size + size % 2;
  }
  return result;
}
function readJpeg(b) {
  let xmp = null, iptc = null;
  for (let at = 2; at < b.length;) {
    if (b[at++] !== 255) throw new Error("Invalid JPEG marker");
    while (b[at] === 255) at++;
    const marker = b[at++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const size = number(b, at, 2);
    if (size < 2 || at + size > b.length) throw new Error("Truncated JPEG header");
    const data = b.slice(at + 2, at + size);
    if (marker === 225 && ascii(data.slice(0, 29)) === "http://ns.adobe.com/xap/1.0/\0") xmp = xmpMetadata(text(data.slice(29)));
    if (marker === 237 && ascii(data.slice(0, 14)) === "Photoshop 3.0\0") iptc = photoshopMetadata(data.slice(14)) ?? iptc;
    at += size;
  }
  return { xmp, iptc };
}
function readEps(b) {
  const eps = text(b);
  const match = eps.match(/^%%BeginPhotoshop:.*(?:\r\n|\r|\n)([\s\S]*?)^%%EndPhotoshop/m);
  let iptc = null;
  if (match) {
    const hex = match[1].replace(/^%\s*/gm, "").replace(/\s/g, "");
    if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Invalid EPS Photoshop hex data");
    iptc = photoshopMetadata(Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16)));
  }
  return { xmp: xmpMetadata(eps), iptc };
}
export function readStockFile(bytes) {
  let kind, fields;
  if (bytes[0] === 255 && bytes[1] === 216) { kind = "JPEG"; fields = readJpeg(bytes); }
  else if (ascii(bytes.slice(0, 10)) === "%!PS-Adobe") { kind = "EPS"; fields = readEps(bytes); }
  else throw new Error("Unsupported file: select an exported JPEG or EPS");
  const metadata = fields.xmp ?? fields.iptc;
  if (!metadata?.title || !metadata.description || !metadata.tags.length) throw new Error("No complete embedded Title, Description and Tags found");
  return { kind, metadata, iptc: fields.iptc, carriers: [fields.xmp && "XMP", fields.iptc && "IPTC-IIM"].filter(Boolean) };
}
