import { useState } from "react";
import type { StockPreferences } from "../lib/stockupload/preferences";
export default function StockPresets({ prefs, update }: { prefs: StockPreferences; update: (p: Partial<StockPreferences>) => void }) {
  const [picked, setPicked] = useState("");
  const preset = prefs.presets.find(p => p.name === picked);
  const save = () => {
    const name = window.prompt("Shutterstock preset name", picked)?.trim(); if (!name) return;
    update({ presets: [...prefs.presets.filter(p => p.name !== name), { name, formats: prefs.formats }] }); setPicked(name);
  };
  const rename = () => {
    const name = window.prompt("Rename preset", picked)?.trim();
    if (!name || prefs.presets.some(p => p.name === name)) return;
    update({ presets: prefs.presets.map(p => p.name === picked ? { ...p, name } : p) }); setPicked(name);
  };
  return <span className="stock-presets"><select aria-label="Shutterstock preset" value={picked} onChange={e => {
    setPicked(e.target.value); const p = prefs.presets.find(p => p.name === e.target.value); if (p) update({ formats: p.formats });
  }}><option value="">Shutterstock · custom</option>{prefs.presets.map(p => <option key={p.name}>{p.name}</option>)}</select>
    <button onClick={save}>Save as</button><button disabled={!preset} onClick={rename}>Rename</button>
    <button disabled={!preset} onClick={() => { update({ presets: prefs.presets.filter(p => p.name !== picked) }); setPicked(""); }}>Remove</button></span>;
}
