// GetDataButton.tsx — the "Get data" button of every tab's bulk bar (2026-11-10).
// Off while no row is selected; pressed, it reads the selected rows ONCE (the
// tab hands over a function, so nothing is computed while the dialog is shut)
// and opens the dialog (ui/GetDataDialog).

import { useState } from "react";
import type { DataRow } from "../lib/getdata";
import GetDataDialog from "./GetDataDialog";

export interface GetDataButtonProps {
  /** The tab's test-id prefix: `<testid>-get-data`, `-dialog`, `-field-…`, `-preview`, `-copy`. */
  testid: string;
  /** How many rows are selected. */
  count: number;
  /** The selected rows as the dialog needs them. */
  rows: () => readonly DataRow[];
}

export default function GetDataButton({ testid, count, rows }: GetDataButtonProps) {
  const [open, setOpen] = useState<readonly DataRow[] | null>(null);
  return (
    <>
      <button type="button" className="svg-btn" data-testid={`${testid}-get-data`} disabled={count === 0}
        title="Copy the file names, status or path of the selected rows as a comma-separated list"
        onClick={() => setOpen(rows())}>
        ⧉ Get data
      </button>
      {open !== null && <GetDataDialog testid={testid} rows={open} onClose={() => setOpen(null)} />}
    </>
  );
}
