// SvgBuilderInlineText.tsx — edit the banner's title or subtitle right on the
// artboard (2026-11-13): double-click the text, type, and clicking outside (or
// Enter) saves it as one undo entry; Escape leaves it as it was. Shift+Enter
// starts a new line. The side fields stay too. The text is found through the
// `data-banner-text` mark banner.ts puts on each text block.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { BuilderApi } from "./useSvgBuilder";

type Which = "title" | "subtitle";
interface Editing { which: Which; x: number; y: number; width: number; height: number }

/** The banner text block a double-click landed on (the SVG lives in a shadow root). */
function textBlockOf(e: Event): Element | null {
  for (const node of e.composedPath()) {
    if (node instanceof Element && node.hasAttribute("data-banner-text")) return node;
  }
  return null;
}

/** Where the block sits on the unscaled artboard. */
function editingOf(block: Element, board: HTMLElement, zoom: number): Editing {
  const which: Which = block.getAttribute("data-banner-text") === "subtitle" ? "subtitle" : "title";
  const r = block.getBoundingClientRect();
  const o = board.getBoundingClientRect();
  return { which, x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, width: r.width / zoom, height: r.height / zoom };
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
  const [text, setText] = useState(banner[editing.which]);
  const cancelled = useRef(false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const finish = () => {
    if (!cancelled.current && text !== banner[editing.which]) {
      b.actions.setConfig({ ...b.config, banner: { ...banner, [editing.which]: text } }, editing.which === "title" ? "Edit banner title" : "Edit banner subtitle");
    }
    onDone();
  };
  const size = editing.which === "title" ? banner.titleSize : banner.subtitleSize;
  return <textarea ref={input} className="bld-inline-text" data-testid={`builder-inline-${editing.which}`} value={text}
    aria-label={editing.which === "title" ? "Edit the banner title" : "Edit the banner subtitle"}
    style={{ left: editing.x - 6, top: editing.y - 4, width: Math.max(120, editing.width + 24), height: Math.max(size * 1.6, editing.height + 8), fontSize: size }}
    onChange={(e) => setText(e.target.value)} onBlur={finish}
    onKeyDown={(e) => {
      if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
    }} />;
}
