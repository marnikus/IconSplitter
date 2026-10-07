// provider.ts — which provider and model the metadata run may use (design §8).
// Two rules the request states, both enforced here rather than trusted:
//   1. the configured model is VERIFIED against the provider's own list; an
//      absent exact id is a refusal with the reason — never a silent substitute;
//   2. cost is the provider's own number when it reported one, and is otherwise
//      labelled an ESTIMATE. The two are never mixed into one unlabelled figure.
// Everything is pure: the catalog arrives from the network, the prices from the
// rate card below, and the arithmetic and the wording live here.

/** The default model, verified against Google's model documentation. */
export const FLASH_LITE = "gemini-3.1-flash-lite";

/** Published rate card (USD per 1M tokens) used only for the "Estimated" figure. */
export const RATE_CARD = { input: 0.25, output: 1.5 } as const;

export interface CatalogEntry {
  id: string;
}

export type ModelChoice =
  | { ok: true; model: string; source: "verified" }
  | { ok: false; reason: string };

/**
 * The configured model must appear in the provider's list, exactly. `null`
 * (the list could not be read) is a refusal too: an unverified run is exactly
 * the silent substitution the request forbids.
 */
export function chooseModel(catalog: readonly CatalogEntry[] | null, wanted: string): ModelChoice {
  const id = wanted.trim();
  if (id === "") return { ok: false, reason: "No model is configured — set one before generating metadata." };
  if (catalog === null) return { ok: false, reason: `The model list could not be read, so "${id}" is unverified. Credentials and endpoint were saved anyway.` };
  if (catalog.length === 0) return { ok: false, reason: `The provider returned no models, so "${id}" is unverified. Credentials and endpoint were saved anyway.` };
  if (!catalog.some((m) => m.id === id)) {
    const near = catalog.filter((m) => m.id.includes(splitId(id).tail)).map((m) => m.id).slice(0, 5);
    const hint = near.length > 0 ? ` Similar ids: ${near.join(", ")}.` : "";
    return { ok: false, reason: `The provider does not offer "${id}".${hint} Nothing was substituted.` };
  }
  return { ok: true, model: id, source: "verified" };
}

/** "vertex/google/gemini-x" -> { head: "vertex/google", tail: "gemini-x" }. */
export function splitId(id: string): { head: string; tail: string } {
  const at = id.lastIndexOf("/");
  return at < 0 ? { head: "", tail: id } : { head: id.slice(0, at), tail: id.slice(at + 1) };
}

export interface UsageLike {
  input: number | null;
  output: number | null;
}

/** The rate-card estimate in USD, or null when no token count was reported. */
export function estimateCost(usage: UsageLike, rates = RATE_CARD): number | null {
  const { input, output } = usage;
  if (input === null && output === null) return null;
  const cost = ((input ?? 0) / 1_000_000) * rates.input + ((output ?? 0) / 1_000_000) * rates.output;
  return Math.round(cost * 100_000) / 100_000;
}

export interface CostLine {
  text: string;
  /** True when the number shown is an estimate rather than a provider figure. */
  estimated: boolean;
}

/**
 * One wording for the cost, used by the row and the export JSON:
 * a provider-reported number wins; otherwise the estimate is labelled as such.
 */
export function costLine(
  reported: number | null, usage: UsageLike, rates = RATE_CARD,
): CostLine {
  if (reported !== null) return { text: `$${reported.toFixed(5)} (provider)`, estimated: false };
  const est = estimateCost(usage, rates);
  if (est === null) return { text: "cost unknown (no tokens reported)", estimated: true };
  return { text: `Estimated $${est.toFixed(5)} (rate card)`, estimated: true };
}

/** "1,204 in / 512 out" — the token line, one wording for row and JSON. */
export function tokensText(usage: { input: number | null; output: number | null; total: number | null }): string {
  if (usage.input === null && usage.output === null) return "tokens not reported";
  return `${fmt(usage.input)} in / ${fmt(usage.output)} out`;
}

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}
