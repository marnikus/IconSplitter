// upload_metapreview.test.ts — preparing the images the confirmation shows and
// the request sends (design §2.4). The wire seam reads each selected icon's OWN
// approved SVG and renders it with the ONE render primitive the runner uses, so
// the shown bytes and the sent bytes are the same bytes. Proves the per-row
// identity with marker-bearing SVG documents: the renderer never receives
// another row's document, and a single selection renders only that icon.
import { describe, expect, it } from "vitest";
import { previewFor, type SentPreview } from "../src/lib/upload/sentpreview";
import { preparePreviews, type PreviewSources } from "../src/upload/metapreview";
import { FakeDir, FakeFile } from "./helpers/fakefs";

/** One approved SVG per icon, each carrying its own marker. */
const svgFor = (mark: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-icon="${mark}"><path d="M2 2h20v20H2z"/></svg>`;

interface Tree {
  root: FakeDir;
  sources: PreviewSources[];
}

function makeTree(names: readonly string[]): Tree {
  const root = new FakeDir("split_root");
  const dir = new FakeDir("architecture");
  const sources: PreviewSources[] = [];
  for (const name of names) {
    const file = new FakeFile(`${name}_AI.svg`, 100, 1000, svgFor(name.toUpperCase()));
    dir.children.set(file.name, file);
    sources.push({
      id: `architecture::${name}`, svgPath: `architecture/${file.name}`,
      svgName: file.name, fingerprint: `${file.size}:${file.mtime}`,
    });
  }
  root.children.set("architecture", dir);
  return { root, sources };
}

/** A renderer that echoes the document it was handed (no canvas in this suite). */
function echoRender(drawn: string[]) {
  return async (svgText: string): Promise<string> => {
    drawn.push(svgText);
    return `data:image/jpeg;base64,${Buffer.from(svgText, "utf8").toString("base64")}`;
  };
}

const bodyOf = (p: SentPreview) => Buffer.from(p.image.split(",")[1], "base64").toString("utf8");

describe("preparing the previews of a selection", () => {
  it("renders each selected icon's own approved SVG, in the selection's order", async () => {
    const { root, sources } = makeTree(["fog", "arch", "court"]);
    const drawn: string[] = [];
    const out = await preparePreviews({ root, sources, ids: [sources[1].id, sources[0].id], render: echoRender(drawn) });
    expect(out.map((p) => p.name)).toEqual(["arch_AI.svg", "fog_AI.svg"]);
    expect(bodyOf(out[0])).toContain('data-icon="ARCH"');
    expect(bodyOf(out[0])).not.toContain("FOG"); // never the neighbour's artwork
    expect(out[1].id).toBe(sources[0].id);
    expect(out[1].fingerprint).toBe(sources[0].fingerprint);
    expect(drawn).toEqual([svgFor("ARCH"), svgFor("FOG")]);
  });

  it("renders ONLY the one icon the user asked for (the 'first item' trap)", async () => {
    const { root, sources } = makeTree(["fog", "arch"]);
    const drawn: string[] = [];
    const out = await preparePreviews({ root, sources, ids: [sources[1].id], render: echoRender(drawn) });
    expect(out).toHaveLength(1);
    expect(drawn).toEqual([svgFor("ARCH")]);
    expect(drawn.join("")).not.toContain("FOG");
  });

  it("is bounded: a folder-wide selection renders at most the limit", async () => {
    const names = Array.from({ length: 30 }, (_, i) => `i${i}`);
    const { root, sources } = makeTree(names);
    const drawn: string[] = [];
    const out = await preparePreviews({ root, sources, ids: sources.map((s) => s.id), render: echoRender(drawn) });
    expect(out).toHaveLength(24);
    expect(drawn).toHaveLength(24);
    expect(out[0].name).toBe("i0_AI.svg");
    expect(out.at(-1)?.name).toBe("i23_AI.svg");
  });

  it("isolates a bad icon: an unreadable SVG is dropped, the rest still arrive", async () => {
    const { root, sources } = makeTree(["fog", "arch"]);
    root.children.delete("architecture"); // both files vanish under the root
    const out = await preparePreviews({ root, sources, ids: sources.map((s) => s.id), render: echoRender([]) });
    expect(out).toEqual([]);
  });

  it("drops a preview whose file changed while the dialog was open (never stale bytes)", async () => {
    const { root, sources } = makeTree(["fog"]);
    const out = await preparePreviews({ root, sources, ids: sources.map((s) => s.id), render: echoRender([]) });
    const file = (root.children.get("architecture") as FakeDir).children.get("fog_AI.svg") as FakeFile;
    file.size = 999; // the user re-exported/replaced the approved SVG in the meantime
    expect(previewFor(out, sources[0].id, `${file.size}:${file.mtime}`)).toBeNull();
    expect(previewFor(out, sources[0].id, sources[0].fingerprint)).toBe(out[0]);
  });

  it("ignores an id that is not part of the selection's sources", async () => {
    const { root, sources } = makeTree(["fog"]);
    const out = await preparePreviews({ root, sources, ids: ["architecture::ghost"], render: echoRender([]) });
    expect(out).toEqual([]);
  });
});
