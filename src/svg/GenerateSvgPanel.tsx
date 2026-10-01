import { useMemo, useState } from "react";
import { extractSvg, validateSvg } from "../lib/svg";
import "./svg.css";

type Row = { id: string; name: string; path: string; url: string; svg: string; review: "pending" | "approved" | "declined"; error?: string };
const DEFAULT_PROMPT = "Create 4 split SVG icons. SVG connection rule: Any path endpoint intended to touch, overlap, or nearly meet another path must be snapped mathematically to that path or its anchor point. Project nearby endpoints onto the exact curve/intersection. Never leave tiny gaps, floating endpoints, overshoots, or approximate connections. Connected paths should share an exact anchor or merged geometry and remain seamless at every zoom level, but only when the connection is visually intended and does not break the image.";

export default function GenerateSvgPanel() {
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState(() => localStorage.getItem("iconsplitter.svg-prompt") ?? DEFAULT_PROMPT);
  const [provider, setProvider] = useState("gpt-6.1-sol");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => rows, [rows]);
  const savePrompt = (value: string) => { setPrompt(value); localStorage.setItem("iconsplitter.svg-prompt", value); };

  async function chooseRoot() {
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) return setNotice("Folder access needs Chrome or Edge.");
    const handle = await picker(); setRoot(handle); setNotice("Scanning approved Selection results…");
    const found: Row[] = []; await scan(handle, "", found); setRows(found); setNotice(`${found.length} approved AI images found.`);
  }
  async function generate(ids: string[]) {
    if (!key.trim()) return setNotice("Add your Requesty key locally before generating.");
    if (busy) return; setBusy(true); setNotice(`Confirming ${ids.length} image${ids.length === 1 ? "" : "s"} with ${provider}…`);
    if (!window.confirm(`Generate SVG for ${ids.length} approved image(s)?\nProvider: Requesty · Model: ${provider}\nPrompt: ${prompt.slice(0, 180)}…`)) { setBusy(false); return; }
    for (const id of ids) { const row = rows.find((item) => item.id === id); if (row) await request(row); }
    setBusy(false); setNotice("Generation complete. Review each valid SVG before saving or approving.");
  }
  async function request(row: Row) {
    try {
      const response = await fetch("https://app.requesty.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: provider, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: row.url } }] }] }) });
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const svg = extractSvg(data.choices?.[0]?.message?.content ?? "");
      const check = validateSvg(svg ?? ""); setRows((all) => all.map((item) => item.id === row.id ? { ...item, svg: check.ok ? check.svg : "", error: check.ok ? undefined : check.errors.join(" ") } : item));
    } catch (error) { setRows((all) => all.map((item) => item.id === row.id ? { ...item, error: (error as Error).message } : item)); }
  }
  function decide(id: string, review: Row["review"]) { setRows((all) => all.map((row) => row.id === id ? { ...row, review } : row)); }
  return <main className="svg-panel" data-testid="generate-svg-panel">
    <header className="svg-header"><div><h1>Generate SVG</h1><p>Approved AI references → reviewed, versioned SVG output</p></div><button className="v2-btn primary" onClick={chooseRoot}>Choose source folder…</button></header>
    <section className="svg-controls"><div className="svg-source"><b>{root?.name ?? "No folder selected"}</b><span>{rows.length} approved · {rows.filter((r) => r.svg).length} generated</span><button className="v2-btn tiny" onClick={() => { const all = new Set(rows.map((r) => r.id)); setSelected(selected.size === rows.length ? new Set() : all); }}>{selected.size === rows.length ? "Deselect all" : "Select all visible"}</button></div><div className="svg-fields"><label>Provider / model<input value={provider} onChange={(e) => setProvider(e.target.value)} /></label><label>Request batch size<input type="number" min="1" max="9" defaultValue="4" /></label><label>Local API key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Never saved or logged" /></label></div><label className="svg-prompt">Generation prompt <button className="link-button" onClick={() => savePrompt(DEFAULT_PROMPT)}>Reset default</button><textarea value={prompt} onChange={(e) => savePrompt(e.target.value)} /></label><button className="v2-btn primary" disabled={!selected.size || busy} onClick={() => void generate([...selected])}>{busy ? "Generating…" : `Generate selected (${selected.size})`}</button></section>
    {notice && <div className="svg-notice">{notice}</div>}<div className="svg-list" role="list">{visible.map((row) => <article className="svg-row" key={row.id} role="listitem"><input type="checkbox" checked={selected.has(row.id)} onChange={() => setSelected((old) => { const next = new Set(old); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next; })} aria-label={`Select ${row.name}`} /><img src={row.url} alt="Approved AI reference" /><div className="svg-file"><b>{row.name}</b><small>{row.path}</small></div><div className="svg-preview">{row.svg ? <div dangerouslySetInnerHTML={{ __html: row.svg }} /> : <span>Not generated</span>}</div><div className="svg-status">{row.error ? <em title={row.error}>Invalid / failed</em> : row.svg ? <strong className={row.review}>{row.review}</strong> : <span>Pending</span>}<small>{row.svg ? "Valid SVG · newest" : "Awaiting generation"}</small></div><div className="svg-actions"><button className="v2-btn tiny" disabled={!row.svg} onClick={() => setDialog(row)}>View code</button><button className="v2-btn tiny success" disabled={!row.svg} onClick={() => decide(row.id, "approved")}>Approve</button><button className="v2-btn tiny danger" disabled={!row.svg} onClick={() => decide(row.id, "declined")}>Decline</button></div></article>)}</div>{dialog && <div className="svg-dialog" role="dialog" aria-modal="true"><div className="svg-dialog-card"><h2>{dialog.name} · SVG code</h2><textarea readOnly value={dialog.svg} onFocus={(e) => e.currentTarget.select()} /><div><button className="v2-btn primary" onClick={() => void navigator.clipboard.writeText(dialog.svg)}>Copy SVG code</button><button className="v2-btn" onClick={() => setDialog(null)}>Close</button></div></div></div>}
  </main>;
}

async function scan(dir: FileSystemDirectoryHandle, parent: string, output: Row[]) { for await (const [name, handle] of dir.entries()) { const path = parent ? `${parent}/${name}` : name; if (handle.kind === "directory") await scan(handle, path, output); else if (/\.(png|jpe?g|webp)$/i.test(name) && /_ai\./i.test(name)) { const file = await handle.getFile(); output.push({ id: `${path}:${file.lastModified}:${file.size}`, name, path, url: URL.createObjectURL(file), svg: "", review: "pending" }); } } }
