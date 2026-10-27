import DisclosureGroup from "../ui/DisclosureGroup";
import type { StockState } from "./state";
import type { TransferPlan } from "../lib/stockupload/types";
export default function StockReport({ state, plan }: { state: StockState; plan: TransferPlan }) {
  return <>
    <div className="svg-statusbar" role="status" aria-live="polite"><span>{state.scanning ? "Scanning committed export packages…" : `${state.rows.length} packages · ${state.message}`}</span></div>
    {plan.excluded.map(s => <p className="svg-note warn" key={s}>{s}</p>)}
    {state.errors.length > 0 && <DisclosureGroup label={`${state.errors.length} rejected export folders`}>{state.errors.map(e => <p className="svg-note warn" key={e}>{e}</p>)}</DisclosureGroup>}
    {state.receipts.map((r, i) => <p className="svg-note" key={i}>{r.name}: {r.state} — {r.detail}</p>)}
  </>;
}
