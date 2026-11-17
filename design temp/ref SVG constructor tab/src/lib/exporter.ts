import type { SheetConfig } from "./sheet";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function relativeRect(element: Element, rootRect: DOMRect, rootScale: number) {
  const rect = element.getBoundingClientRect();
  return {
    left: (rect.left - rootRect.left) * rootScale,
    top: (rect.top - rootRect.top) * rootScale,
    width: rect.width * rootScale,
    height: rect.height * rootScale,
  };
}

function textElement(element: Element | null, rootRect: DOMRect, rootScale: number) {
  if (!element) return "";
  const style = window.getComputedStyle(element);
  const fontSize = parseFloat(style.fontSize) || 10;
  const fontFamily = style.fontFamily || "'DM Sans', Arial, sans-serif";
  const weight = style.fontWeight || 400;
  const color = style.color || "#222222";
  const letterSpacing = parseFloat(style.letterSpacing) || 0;
  const transform = style.textTransform;
  const lines = Array.from(element.querySelectorAll<HTMLElement>("span"));
  const content = lines.length > 0 ? lines : [element as HTMLElement];

  return content
    .filter((line) => (line.textContent || "").trim().length > 0)
    .map((line) => {
      const rect = line.getBoundingClientRect();
      const left = (rect.left - rootRect.left) * rootScale;
      const top = (rect.top - rootRect.top) * rootScale;
      const raw = (line.textContent || "").replace(/\u00A0/g, " ").trim();
      const text = transform === "uppercase" ? raw.toUpperCase() : raw;
      return `<text x="${(left + (rect.width * rootScale) / 2).toFixed(2)}" y="${(top + fontSize * 0.83).toFixed(2)}" text-anchor="middle" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${weight}" letter-spacing="${letterSpacing}" fill="${color}">${escapeXml(text)}</text>`;
    })
    .join("\n");
}

function extractIcon(svg: SVGSVGElement, rootRect: DOMRect, rootScale: number, strokeColor: string, strokeWidth: number) {
  const rect = svg.getBoundingClientRect();
  const innerWidth = rect.width * rootScale;
  const innerHeight = rect.height * rootScale;
  const x = (rect.left - rootRect.left) * rootScale;
  const y = (rect.top - rootRect.top) * rootScale;
  const viewBox = svg.getAttribute("viewBox") || "0 0 24 24";
  const scale = 24 / Math.max(innerWidth, 1);
  return `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${innerWidth.toFixed(2)}" height="${innerHeight.toFixed(2)}" viewBox="${viewBox}" fill="none" stroke="${strokeColor}" stroke-width="${(strokeWidth * scale).toFixed(3)}" stroke-linecap="${svg.getAttribute("stroke-linecap") || "round"}" stroke-linejoin="${svg.getAttribute("stroke-linejoin") || "round"}">${svg.innerHTML}</svg>`;
}

export function buildSvgFromSheet(artboard: HTMLElement, config: SheetConfig) {
  const rootRect = artboard.getBoundingClientRect();
  const rootScale = rootRect.width > 0 ? config.artboard.width / rootRect.width : 1;
  const svgParts: string[] = [];
  const background = `
    <rect x="0" y="0" width="${config.artboard.width}" height="${config.artboard.height}" fill="${config.artboard.background}" ${config.artboard.radius ? `rx="${config.artboard.radius}"` : ""} />
  `;
  svgParts.push(background);

  const bannerElement = artboard.querySelector("[data-banner]");
  if (bannerElement) {
    const banner = relativeRect(bannerElement, rootRect, rootScale);
    svgParts.push(
      `<rect x="${banner.left.toFixed(2)}" y="${banner.top.toFixed(2)}" width="${banner.width.toFixed(2)}" height="${banner.height.toFixed(2)}" fill="${config.banner.background}" />`,
    );
    const accentArea = artboard.querySelector("[data-banner-accent]");
    if (accentArea) {
      const accent = relativeRect(accentArea, rootRect, rootScale);
      svgParts.push(
        `<rect x="${accent.left.toFixed(2)}" y="${accent.top.toFixed(2)}" width="${accent.width.toFixed(2)}" height="${accent.height.toFixed(2)}" fill="${config.banner.accent}" />`,
      );
    }
    const titleElement = artboard.querySelector('[data-text="title"]');
    const titleSvg = textElement(titleElement, rootRect, rootScale);
    if (titleSvg) svgParts.push(`<g data-export="title">${titleSvg}</g>`);

    const subtitle = artboard.querySelector('[data-text="subtitle"]');
    const subtitleSvg = textElement(subtitle, rootRect, rootScale);
    if (subtitleSvg) svgParts.push(`<g data-export="subtitle">${subtitleSvg}</g>`);

    const divider = artboard.querySelector<HTMLElement>("[data-banner-divider]");
    if (divider) {
      const rect = relativeRect(divider, rootRect, rootScale);
      const style = window.getComputedStyle(divider);
      svgParts.push(
        `<rect data-export="accent-rule" x="${rect.left.toFixed(2)}" y="${rect.top.toFixed(2)}" width="${rect.width.toFixed(2)}" height="${rect.height.toFixed(2)}" rx="${rect.height.toFixed(2)}" fill="${style.backgroundColor}" />`,
      );
    }

    artboard.querySelectorAll<HTMLElement>("[data-banner-hero-ring]").forEach((ring) => {
      const rect = relativeRect(ring, rootRect, rootScale);
      const style = window.getComputedStyle(ring);
      svgParts.push(
        `<circle data-export="hero-ring" cx="${(rect.left + rect.width / 2).toFixed(2)}" cy="${(rect.top + rect.height / 2).toFixed(2)}" r="${(Math.min(rect.width, rect.height) / 2).toFixed(2)}" fill="none" stroke="${style.borderTopColor}" stroke-width="${style.borderTopWidth}" opacity="${style.opacity}" />`,
      );
    });

    const hero = bannerElement.querySelector<SVGSVGElement>("[data-banner-hero]");
    if (hero) {
      svgParts.push(`<g data-export="hero">${extractIcon(hero, rootRect, rootScale, config.banner.accent, 1.1)}</g>`);
    }
  }

  const captions: string[] = [];
  artboard.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell) => {
    const icon = cell.querySelector<SVGSVGElement>("svg[data-sheet-icon]");
    if (icon) {
      svgParts.push(`<g data-export="icon">${extractIcon(icon, rootRect, rootScale, config.icons.color, config.icons.strokeWidth)}</g>`);
    }
    const caption = cell.querySelector<HTMLElement>("[data-caption]");
    if (caption) {
      const captionSvg = textElement(caption, rootRect, rootScale);
      if (captionSvg) captions.push(captionSvg);
    }
  });
  if (captions.length > 0) svgParts.push(`<g data-export="captions">${captions.join("\n")}</g>`);

  const w = config.artboard.width;
  const h = config.artboard.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" shape-rendering="geometricPrecision">
  <title>${escapeXml(config.banner.title || "Icon sheet")} — icon sheet</title>
  <desc>Generated with Glyph Sheet Constructor. Editable stroke-only icon sheet.</desc>
  ${svgParts.join("\n  ")}
</svg>`;
}

function slugify(value: string) {
  return (value || "icon-sheet")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function downloadSvg(artboard: HTMLElement, config: SheetConfig) {
  const svg = buildSvgFromSheet(artboard, config);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), `${slugify(config.banner.title)}.svg`, true);
}

export async function downloadPng(artboard: HTMLElement, config: SheetConfig, pixelRatio = 2) {
  const svg = buildSvgFromSheet(artboard, config);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterize the SVG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = config.artboard.width * pixelRatio;
    canvas.height = config.artboard.height * pixelRatio;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.scale(pixelRatio, pixelRatio);
    context.drawImage(image, 0, 0, config.artboard.width, config.artboard.height);
    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${slugify(config.banner.title)}@${pixelRatio}x.png`;
    link.href = pngUrl;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadPreset(config: SheetConfig, selection: string[], seed: number) {
  const payload = {
    version: 1,
    generator: "Glyph Sheet Constructor",
    created: new Date().toISOString(),
    config,
    selection,
    seed,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  triggerDownload(URL.createObjectURL(blob), `${slugify(config.banner.title)}-preset.json`, true);
}

export async function copySvg(artboard: HTMLElement, config: SheetConfig) {
  const svg = buildSvgFromSheet(artboard, config);
  await navigator.clipboard.writeText(svg);
}

function triggerDownload(href: string, filename: string, revoke = false) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}
