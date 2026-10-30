// @vitest-environment node
// svgimgedit.test.ts — the image-EDIT wire (user request 2026-10-19): AI source
// regeneration sends the PROMPT and the current main AI image as the reference.
// Requesty documents POST {base}/images/edits (multipart, `image[]` per file,
// docs.requesty.ai/api-reference/endpoint/images-edits-create, read 2026-10-19).
import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_CONNECTION } from "../src/lib/svgconnections";
import { buildEditForm, editQuality, imageEditUrl, mimeForImage } from "../src/lib/svgimgedit";

const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

describe("the edit endpoint", () => {
  it("joins the base without a trailing-slash dupe", () => {
    expect(imageEditUrl("https://router.requesty.ai/v1")).toBe("https://router.requesty.ai/v1/images/edits");
    expect(imageEditUrl("https://router.requesty.ai/v1/")).toBe("https://router.requesty.ai/v1/images/edits");
  });

  it("maps the image extension to its mime type (png fallback)", () => {
    expect(mimeForImage("a.png")).toBe("image/png");
    expect(mimeForImage("a.JPG")).toBe("image/jpeg");
    expect(mimeForImage("a.jpeg")).toBe("image/jpeg");
    expect(mimeForImage("a.webp")).toBe("image/webp");
    expect(mimeForImage("a.bin")).toBe("image/png");
  });

  it("edit quality is only what the endpoint documents: auto/low/medium/high", () => {
    expect(editQuality("xhigh")).toBe("high");
    expect(editQuality("max")).toBe("high");
    expect(editQuality("low")).toBe("low");
    expect(editQuality("auto")).toBe("auto");
  });
});

describe("the multipart body", () => {
  const conn = { ...DEFAULT_IMAGE_CONNECTION, image: { ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "1024x1024" as const, quality: "xhigh" as const } };

  it("carries model, prompt and the reference as image[] — the SAME bytes, named", async () => {
    const form = buildEditForm(conn, "Redraw thin stroke", { blob: png, fileName: "fog_AI.png" });
    expect(form.get("model")).toBe(conn.model);
    expect(form.get("prompt")).toBe("Redraw thin stroke");
    const file = form.get("image[]") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("fog_AI.png");
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(form.getAll("image[]")).toHaveLength(1);
  });

  it("sends the connection's size/background/format, the documented quality, and nothing the edit API does not take", () => {
    const form = buildEditForm(conn, "p", { blob: png, fileName: "x.png" });
    expect(form.get("size")).toBe("1024x1024");
    expect(form.get("quality")).toBe("high");
    expect(form.get("background")).toBe(conn.image.background);
    expect(form.get("output_format")).toBe(conn.image.outputFormat);
    expect(form.has("response_format")).toBe(false);
    expect(form.has("n")).toBe(false);
    expect(form.has("image")).toBe(false);
  });
});
