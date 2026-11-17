// getdatachoice.ts — what the "Get data" dialog had ticked last (2026-11-10),
// kept for the rest of the session and shared by every tab, so the next open
// starts with the same choice. In memory only: no storage key, nothing persisted.

import { DATA_FIELDS, type DataField } from "../lib/getdata";

const FIRST: readonly DataField[] = ["svg", "png"];
let choice: readonly DataField[] = FIRST;

export const getGetDataChoice = (): readonly DataField[] => choice;

/** Keeps the choice in the dialog's order. */
export function setGetDataChoice(next: readonly DataField[]): void {
  choice = DATA_FIELDS.map((f) => f.id).filter((id) => next.includes(id));
}

export function resetGetDataChoice(): void {
  choice = FIRST;
}
