import type { FormatSelection, StockArtifact, StockPackage, TransferPlan } from "./types";

export function makeTransferPlan(rows: readonly StockPackage[], formats: FormatSelection, epsReviewed: boolean): TransferPlan {
  const plan: TransferPlan = { files: [], excluded: [], bytes: 0 };
  const names = new Set<string>();
  for (const row of rows) for (const file of row.artifacts) {
    if (!selected(file, formats)) continue;
    const reason = eligibility(file, epsReviewed);
    if (reason !== "") { plan.excluded.push(`${file.name}: ${reason}`); continue; }
    const key = file.name.toLowerCase();
    if (names.has(key)) throw new Error(`Remote filename collision: ${file.name}`);
    names.add(key); plan.files.push(file); plan.bytes += file.bytes;
  }
  return plan;
}
function selected(file: StockArtifact, f: FormatSelection): boolean {
  if (file.kind === "jpg" || file.kind === "png") return f.raster;
  return f[file.kind];
}
function eligibility(file: StockArtifact, reviewed: boolean): string {
  if (file.kind !== "jpg" && file.kind !== "eps") return "Shutterstock does not document this submission format";
  const max = file.kind === "jpg" ? 50_000_000 : 100_000_000;
  if (file.bytes > max) return "Exceeds Shutterstock size limit";
  return file.kind === "eps" && !reviewed ? "Illustrator 8/10 and 4–25 MP artwork bounds require manual review" : "";
}
