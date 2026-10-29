// Build temporary metadata-bearing upload copies; never write to the selected root.
import JSZip from "jszip";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../upload/embed";
import { embedXmpMetadataInEps, verifyEpsMetadata } from "../upload/epsmetadata";
import { embedXmpMetadata, readXmpMetadata } from "../upload/jpeg";
import { readJpegIptc } from "../upload/jpegiptc";
import { sameLegacyMetadata } from "../upload/iptc";
import { sameMetadata } from "../upload/rights";
import { buildXmpPacket, readXmpPacket } from "../upload/xmp";
import type { IconMetadata } from "../upload/meta";
import { embedPngXmp } from "./pngxmp";
import type { ExportedItem, StockFtpPreset } from "./types";

function singleLine(text: string): string {
  return text.replace(/[\s\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim();
}

export function combinedTitle(title: string, description: string): string {
  const first = singleLine(title);
  const second = singleLine(description);
  if (!first) return second;
  if (!second) return first;
  return `${first.replace(/\.+$/u, "")}. ${second}`;
}

export function usesShutterstockCaption(target: StockFtpPreset): boolean {
  return target.template === "shutterstock" || target.host.trim().toLowerCase() === "ftps.shutterstock.com";
}

function uploadMetadata(item: ExportedItem, target?: StockFtpPreset): IconMetadata {
  const meta = item.record.metadata;
  if (!meta || !singleLine(meta.title) || !singleLine(meta.description)) {
    throw new Error("Accepted title and description are required to combine upload metadata.");
  }
  const title = combinedTitle(meta.title, meta.description);
  const mirrorCaption = target !== undefined && usesShutterstockCaption(target);
  if (mirrorCaption && new TextEncoder().encode(title).length > 2000) {
    throw new Error("Shutterstock caption exceeds the 2000-byte IPTC limit; shorten the title or description.");
  }
  return { title, description: mirrorCaption ? title : meta.description,
    tags: meta.tags, creator: meta.creator, copyright: meta.copyright };
}

function formatOf(name: string): string {
  const lower = name.toLowerCase();
  if (/\.jpe?g$/.test(lower)) return "jpg";
  if (/\.(svg|eps|png|zip)$/.test(lower)) return lower.slice(lower.lastIndexOf(".") + 1);
  return "";
}

function verifiedJpeg(name: string, bytes: Uint8Array, meta: IconMetadata): Uint8Array {
  const output = embedXmpMetadata(bytes, meta);
  if (!sameMetadata(readXmpMetadata(output), meta) || !sameLegacyMetadata(readJpegIptc(output), meta)) throw new Error(`Could not verify metadata in ${name}.`);
  return output;
}

function verifiedText(name: string, bytes: Uint8Array, meta: IconMetadata, format: string): Uint8Array {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (format === "svg") {
    const output = embedMetadataInSvg(text, meta);
    if (!sameMetadata(readEmbeddedMetadata(output), meta)) throw new Error(`Could not verify metadata in ${name}.`);
    return new TextEncoder().encode(output);
  }
  if (format === "eps" && text.startsWith("%!PS-Adobe")) {
    const output = embedXmpMetadataInEps(text, meta);
    if (!verifyEpsMetadata(output, meta)) throw new Error(`Could not verify metadata in ${name}.`);
    return new TextEncoder().encode(output);
  }
  throw new Error(`Cannot safely embed upload metadata in ${name}.`);
}

function embedCarrier(name: string, bytes: Uint8Array, meta: IconMetadata): Uint8Array {
  const format = formatOf(name);
  if (format === "jpg") return verifiedJpeg(name, bytes, meta);
  if (format === "png") {
    if (!sameMetadata(readXmpPacket(buildXmpPacket(meta)), meta)) throw new Error(`Could not verify metadata in ${name}.`);
    return embedPngXmp(bytes, meta);
  }
  return verifiedText(name, bytes, meta, format);
}

async function embedArchive(bytes: Uint8Array, meta: IconMetadata): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  let count = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !["jpg", "svg", "eps", "png"].includes(formatOf(entry.name))) continue;
    const original = await entry.async("uint8array");
    zip.file(entry.name, embedCarrier(entry.name, original, meta), { date: entry.date });
    count++;
  }
  if (!count) throw new Error("ZIP contains no supported metadata-bearing files.");
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function prepareMetadataCopy(item: ExportedItem, fileName: string, bytes: Uint8Array, target?: StockFtpPreset): Promise<Uint8Array> {
  const meta = uploadMetadata(item, target);
  return formatOf(fileName) === "zip" ? embedArchive(bytes, meta) : embedCarrier(fileName, bytes, meta);
}
