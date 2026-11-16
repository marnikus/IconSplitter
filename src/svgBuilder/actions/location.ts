// actions/location.ts — 📂 Location (2026-11-16): show the folder of what the
// stage edits — the open artboard's folder (else its template's), or the edited
// template's — in Windows Explorer. The browser cannot open Explorer, so the local
// helper does it (POST /open-folder, tools/bridge/openfolder.mjs). Without the
// helper, or without the folder's full path, the path is copied instead and the
// toast says why.
import { boundRootPathInfo } from "../../lib/knownroots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { loadBridgeConfig } from "../../upload/configstore";

/** The folder's full path: the opened folder's captured path + the relative `_artboard_sheets/…` folder. */
export function explorerPathOf(rootPath: string, rel: string): string {
  const windows = /^[A-Za-z]:|^\\\\/.test(rootPath);
  const sep = windows ? "\\" : "/";
  const base = rootPath.replace(/[\\/]+$/, "");
  return `${base}${sep}${windows ? rel.replace(/\//g, "\\") : rel}`;
}

/** The relative folder of what the stage edits, or null when it has none yet. */
function locationOf(ctx: BuilderActionContext): string | null {
  const m = ctx.model;
  const artboard = m.artboards.find((a) => a.id === m.editingArtboardId);
  const templateId = artboard?.templateId ?? m.editingTemplateId;
  const template = m.templates.find((t) => t.id === templateId);
  return artboard?.folder ?? template?.folder ?? null;
}

async function copyPath(ctx: BuilderActionContext, path: string, why: string): Promise<void> {
  try { await navigator.clipboard.writeText(path); ctx.say(`${why} — the folder path was copied: ${path}`); } catch { ctx.say(`${why}: ${path}`, true); }
}

async function openLocation(ctx: BuilderActionContext): Promise<void> {
  const rel = locationOf(ctx);
  if (rel === null) return ctx.say("No folder yet — it is made when the template is saved (with the folder open)", true);
  const root = boundRootPathInfo(ctx.model.root).path;
  if (root === "") return copyPath(ctx, rel, "The opened folder's full path is unknown (Ctrl+Shift+C in Explorer, then Rescan)");
  const full = explorerPathOf(root, rel);
  try {
    const res = await fetch(`${loadBridgeConfig().url}/open-folder`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: full }) });
    const out = (await res.json()) as { ok?: boolean; reason?: string };
    if (out.ok === true) return ctx.say(`Opened in Explorer: ${full}`);
    return copyPath(ctx, full, `Explorer could not open it (${out.reason ?? `HTTP ${res.status}`})`);
  } catch {
    return copyPath(ctx, full, "The helper is not running (start run_app.bat) — Explorer cannot be opened from the browser");
  }
}

export function locationActions(get: () => BuilderActionContext): Pick<BuilderActions, "openLocation"> {
  return { openLocation: () => { void openLocation(get()); } };
}
