import { isRecord } from "../isrecord";
import type { StockFormatFlags, StockPresetState } from "./types";

export function parseTargetOptions(
  raw: unknown, ids: Set<string>, parseFormats: (value: unknown) => StockFormatFlags,
): NonNullable<StockPresetState["targetOptions"]> {
  if (!isRecord(raw)) return {};
  const result: NonNullable<StockPresetState["targetOptions"]> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (ids.has(id) && isRecord(value)) {
      result[id] = { formats: parseFormats(value.formats), combineTitleDescription: value.combineTitleDescription === true };
    }
  }
  return result;
}
