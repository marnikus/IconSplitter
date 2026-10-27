import type { StockState } from "./state";
import type { TransferPlan } from "../lib/stockupload/types";
export default function StockReport({ state, plan }: { state: StockState; plan: TransferPlan }) {
  return <><p role="status">{state.scanning ? "Scanning committed export packages…" : `${state.rows.length} packages · ${state.message}`}</p>
    {plan.excluded.map(s => <p className="stock-warning" key={s}>{s}</p>)}
    {state.errors.length > 0 && <details><summary>{state.errors.length} rejected export folders</summary>{state.errors.map(e => <p key={e}>{e}</p>)}</details>}
    {state.receipts.map((r, i) => <p key={i}>{r.name}: {r.state} — {r.detail}</p>)}
  </>;
}
