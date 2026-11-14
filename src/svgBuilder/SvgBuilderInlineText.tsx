// SvgBuilderInlineText.tsx — edit the banner's title or subtitle right on the
// artboard (2026-11-13): double-click the text, type, and clicking outside (or
// Enter) saves it as one undo entry; Escape leaves it as it was. Shift+Enter
// starts a new line. The side fields stay too. The text is found through the
// `data-banner-text` mark banner.ts puts on each text block. Captions (2026-11-14,
// `data-caption-id`) edit the same way; their words are kept on this template /
// artboard only (banner.captionTexts) — the icon's metadata never changes, and
// an emptied caption shows the icon's name again.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { BuilderApi } from "./useSvgBuilder";

type Which = "title" | "subtitle" | "caption";
/** `id` = the captioned icon (captions only); `shown` = the words the sheet shows now. */
interface Editing { which: Which; id: string; shown: string; x: number; y: number; width: number; height: number }

/** The banner text block or caption a double-click landed on (the SVG lives in a shadow root). */
function textBlockOf(e: Event): Element | null {
  for (const node of e.composedPath()) {
    if (node instanceof Element && (node.hasAttribute("data-banner-text") || node.hasAttribute("data-caption-id"))) return node;
  }
  return null;
}

function whichOf(block: Element): Which {
  if (block.hasAttribute("data-caption-id")) return "caption";
  return block.getAttribute("data-banner-text") === "subtitle" ? "subtitle" : "title";
}

/** Where the block sits on the unscaled artboard. */
function editingOf(block: Element, board: HTMLElement, zoom: number): Editing {
  const r = block.getBoundingClientRect();
  const o = board.getBoundingClientRect();
  return { which: whichOf(block), id: block.getAttribute("data-caption-id") ?? "", shown: block.textContent ?? "",
    x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, width: r.width / zoom, height: r.height / zoom };
}

const LABEL: Record<Which, string> = { title: "Edit the banner title", subtitle: "Edit the banner subtitle", caption: "Edit this caption" };

/** The words being edited as stored now (a caption not typed yet starts from what the sheet shows). */
function currentOf(b: BuilderApi, e: Editing): string {
  return e.which === "caption" ? b.config.banner.captionTexts[e.id] ?? e.shown : b.config.banner[e.which];
}

const WIDTH_KEY = { title: "titleWidth", subtitle: "subtitleWidth" } as const;

/**
 * Writes the words back: one undo entry; an emptied caption is dropped (the
 * icon's name shows again). `boxWidth`: the editor's width when the user
 * widened it by hand — kept as the text's width (2026-11-14).
 */
function commitText(b: BuilderApi, e: Editing, text: string, boxWidth: number | null = null): void {
  const banner = b.config.banner;
  if (e.which !== "caption") {
    const width = boxWidth === null ? {} : { [WIDTH_KEY[e.which]]: Math.max(40, Math.round(boxWidth)) };
    b.actions.setConfig({ ...b.config, banner: { ...banner, [e.which]: text, ...width } }, e.which === "title" ? "Edit banner title" : "Edit banner subtitle");
    return;
  }
  const captionTexts = { ...banner.captionTexts };
  if (text.trim() === "") delete captionTexts[e.id]; else captionTexts[e.id] = text.trim();
  b.actions.setConfig({ ...b.config, banner: { ...banner, captionTexts } }, "Edit caption");
}

/**
 * A native listener on the artboard, not React's onDoubleClick: the text lives in
 * the artboard's shadow root, and only the native event carries the path into it.
 */
export function useInlineText(b: BuilderApi, zoom: number, board: RefObject<HTMLDivElement | null>) {
  const [editing, setEditing] = useState<Editing | null>(null);
  useEffect(() => {
    const node = board.current;
    if (node === null) return undefined;
    const onDoubleClick = (e: Event) => {
      const block = textBlockOf(e);
      if (block === null) return;
      e.preventDefault();
      setEditing(editingOf(block, node, zoom));
    };
    node.addEventListener("dblclick", onDoubleClick);
    return () => node.removeEventListener("dblclick", onDoubleClick);
  }, [board, zoom]);
  const editor = editing === null ? null
    : <InlineTextEditor key={`${editing.which}-${editing.x}-${editing.y}`} b={b} editing={editing} onDone={() => setEditing(null)} />;
  return { editor };
}

function InlineTextEditor({ b, editing, onDone }: { b: BuilderApi; editing: Editing; onDone: () => void }) {
  const banner = b.config.banner;
  const [text, setText] = useState(() => currentOf(b, editing));
  const setWidth = editing.which === "caption" ? 0 : banner[WIDTH_KEY[editing.which]];
  const startWidth = Math.max(120, editing.width + 24, setWidth + 24);
  const cancelled = useRef(false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const finish = () => {
    const shown = input.current?.offsetWidth ?? 0; // 0 where nothing is laid out (tests)
    const widened = editing.which !== "caption" && shown > 0 && Math.abs(shown - startWidth) > 4 ? shown - 24 : null;
    if (!cancelled.current && (text !== currentOf(b, editing) || widened !== null)) commitText(b, editing, text, widened);
    onDone();
  };
  const size = editing.which === "title" ? banner.titleSize : editing.which === "subtitle" ? banner.subtitleSize : Math.max(8, editing.height * 0.9);
  return <textarea ref={input} className="bld-inline-text" data-testid={`builder-inline-${editing.which}`} value={text}
    aria-label={LABEL[editing.which]}
    style={{ left: editing.x - 6, top: editing.y - 4, width: startWidth, height: Math.max(size * 1.6, editing.height + 8), fontSize: size }}
    onChange={(e) => setText(e.target.value)} onBlur={finish}
    onKeyDown={(e) => {
      if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
    }} />;
}
