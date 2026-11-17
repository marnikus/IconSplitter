// SvgBuilderIconEditor.tsx — edit an icon right from the artboard (2026-11-15):
// the Generate SVG tab's full-screen editor (SvgPathEditor + the AI source
// panel), on the icon's own SVG in the builder's folder. Finish writes it as one
// undo step (iconedit.ts) and the sheet redraws; ← / → step through the icons
// placed on the artboard (saving first when asked); Cancel drops the session.
import { useMemo } from "react";
import SvgPathEditor from "../svg/pathedit/SvgPathEditor";
import AiSourcePanel from "../svg/pathedit/AiSourcePanel";
import { useImageUrl } from "../svg/useimageurl";
import { useOptionalHistory } from "../state/HistoryProvider";
import { placedOnly } from "../lib/svgBuilder/slots";
import { saveIconEdit } from "./iconedit";
import type { BuilderApi } from "./useSvgBuilder";

/** The icon's AI source image beside its SVG: `<stem>.png`. */
const pngOf = (svgPath: string) => svgPath.replace(/\.svg$/i, ".png");

export default function SvgBuilderIconEditor({ b }: { b: BuilderApi }) {
  const id = b.editingIconId;
  if (id === null) return null;
  return <IconEditorBody key={id} b={b} id={id} />;
}

function IconEditorBody({ b, id }: { b: BuilderApi; id: string }) {
  const hist = useOptionalHistory();
  const rootRef = useMemo(() => ({ current: b.root }), [b.root]);
  const asset = b.assets.find((a) => a.id === id) ?? null;
  const aiUrl = useImageUrl(rootRef, asset === null ? "" : pngOf(asset.svgPath));
  const svg = b.svgTexts[id];
  const ids = [...new Set(placedOnly(b.checked))];
  const at = ids.indexOf(id);
  const close = () => b.actions.openIconEditor(null);
  const save = async (markup: string) => asset !== null && svg !== undefined && hist !== null
    && saveIconEdit({ id, svgPath: asset.svgPath, label: asset.label, before: svg, after: markup, push: hist.push });
  const onGo = (dir: 1 | -1, markup: string | null) => {
    const to = ids[at + dir];
    void (async () => {
      if (markup !== null && markup !== svg && !(await save(markup))) return; // a failed write keeps the editor open
      if (to !== undefined) b.actions.openIconEditor(to);
    })();
  };
  const label = asset === null ? id : `${asset.label} SVG v${asset.version}`;
  return <div className="svg-edit-modal" role="dialog" aria-modal="true" aria-label={`Edit ${label}`} data-testid="builder-icon-editor">
    {asset === null || svg === undefined
      ? <div className="svg-edit-waiting"><p>{asset === null ? "This icon is no longer in the library." : "Reading the SVG…"}</p>
        <button type="button" className="svg-edit-cancel" data-testid="builder-icon-editor-close" onClick={close}>Close</button></div>
      : <SvgPathEditor source={svg} testid={`builder-icon-edit-${id}`} label={label}
          onFinish={(m) => { void (m === svg ? Promise.resolve(true) : save(m)).then((ok) => { if (ok) close(); }); }} onCancel={close}
          nav={{ canPrev: at > 0, canNext: at >= 0 && at < ids.length - 1, position: `${at + 1} / ${ids.length} · ${label}`, onGo }}
          aside={<AiSourcePanel url={aiUrl} name={asset.label} testid="builder-icon-edit-ai" />} />}
  </div>;
}
