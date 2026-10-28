// rowbadge.ts — named coloured labels on SVG-to-upload rows (I-79).
// Pure: catalog CRUD, per-row assignment, multi-apply toggle, filter match.
// Independent of the corner-badge decoration. RULE 13 on every parse.

import { isRecord } from "../isrecord";

export const ROW_BADGE_VERSION = 1;
export const ROW_BADGE_MAX = 40;
export const ROW_BADGE_NAME_MAX = 40;
export const ROW_BADGE_PALETTE = [
  "#745cff", "#32d68b", "#ff5b7e", "#ffc45c",
  "#5cc8ff", "#ff9a5c", "#c45cff", "#5cffc4",
] as const;

export interface RowBadge {
  id: string;
  name: string;
  color: string;
}

export type BadgeFilter = "all" | "none" | "any" | string;

export interface RowBadgeState {
  v: typeof ROW_BADGE_VERSION;
  catalog: RowBadge[];
  assigned: Record<string, string[]>;
}

export const EMPTY_ROW_BADGES: RowBadgeState = { v: ROW_BADGE_VERSION, catalog: [], assigned: {} };

export const HARDCODED_STOCK_BADGES: readonly RowBadge[] = [
  { id: "shutterstock", name: "Shutterstock", color: "#ff4b4b" },
  { id: "adobe-stock", name: "Adobe Stock", color: "#3898ff" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

export function normalizeName(name: string): string {
  return name.trim().slice(0, ROW_BADGE_NAME_MAX);
}

export function parseBadgeFilter(raw: unknown): BadgeFilter {
  if (raw === "all" || raw === "none" || raw === "any") return raw;
  return typeof raw === "string" && raw !== "" ? raw : "all";
}

export function parseRowBadgeState(raw: unknown): RowBadgeState {
  if (!isRecord(raw) || raw.v !== ROW_BADGE_VERSION) return EMPTY_ROW_BADGES;
  const catalog = Array.isArray(raw.catalog) ? raw.catalog.flatMap(toBadge) : [];
  return { v: ROW_BADGE_VERSION, catalog: catalog.slice(0, ROW_BADGE_MAX), assigned: parseAssigned(raw.assigned, catalog) };
}

function toBadge(raw: unknown): RowBadge[] {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") return [];
  const name = typeof raw.name === "string" ? normalizeName(raw.name) : "";
  const color = typeof raw.color === "string" && isHexColor(raw.color) ? raw.color.toLowerCase() : "";
  return name === "" || color === "" ? [] : [{ id: raw.id, name, color }];
}

function parseAssigned(raw: unknown, catalog: readonly RowBadge[]): Record<string, string[]> {
  if (!isRecord(raw)) return {};
  const known = new Set(catalog.map((b) => b.id));
  const out: Record<string, string[]> = {};
  for (const [pairId, ids] of Object.entries(raw)) {
    const kept = uniqueIds(ids).filter((id) => known.has(id));
    if (kept.length > 0) out[pairId] = kept;
  }
  return out;
}

function uniqueIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id !== ""))];
}

export function nextBadgeColor(catalog: readonly RowBadge[]): string {
  return ROW_BADGE_PALETTE[catalog.length % ROW_BADGE_PALETTE.length];
}

export function nextBadgeId(catalog: readonly RowBadge[]): string {
  const used = new Set(catalog.map((b) => b.id));
  let n = 1;
  while (used.has(`rb${n}`)) n += 1;
  return `rb${n}`;
}

export function addBadge(state: RowBadgeState, name: string, color?: string): RowBadgeState | null {
  if (state.catalog.length >= ROW_BADGE_MAX) return null;
  const trimmed = normalizeName(name);
  if (trimmed === "" || nameTaken(state.catalog, trimmed)) return null;
  const nextColor = color && isHexColor(color) ? color.toLowerCase() : nextBadgeColor(state.catalog);
  const badge: RowBadge = { id: nextBadgeId(state.catalog), name: trimmed, color: nextColor };
  return { ...state, catalog: [...state.catalog, badge] };
}

function nameTaken(catalog: readonly RowBadge[], name: string, except?: string): boolean {
  const key = name.toLowerCase();
  return catalog.some((b) => b.id !== except && b.name.toLowerCase() === key);
}

export function removeBadge(state: RowBadgeState, id: string): RowBadgeState {
  const catalog = state.catalog.filter((b) => b.id !== id);
  if (catalog.length === state.catalog.length) return state;
  return { ...state, catalog, assigned: parseAssigned(state.assigned, catalog) };
}

export function renameBadge(state: RowBadgeState, id: string, name: string): RowBadgeState | null {
  const trimmed = normalizeName(name);
  if (trimmed === "" || nameTaken(state.catalog, trimmed, id)) return null;
  return mapBadge(state, id, (b) => ({ ...b, name: trimmed }));
}

export function recolorBadge(state: RowBadgeState, id: string, color: string): RowBadgeState | null {
  if (!isHexColor(color)) return null;
  return mapBadge(state, id, (b) => ({ ...b, color: color.toLowerCase() }));
}

function mapBadge(state: RowBadgeState, id: string, fn: (b: RowBadge) => RowBadge): RowBadgeState | null {
  const catalog = state.catalog.map((b) => (b.id === id ? fn(b) : b));
  return catalog === state.catalog || catalog.every((b, i) => b === state.catalog[i]) ? null : { ...state, catalog };
}

export function badgesOf(state: RowBadgeState, pairId: string): string[] {
  return state.assigned[pairId] ?? [];
}

export function knownBadges(state: RowBadgeState, pairId: string): RowBadge[] {
  const have = new Set(badgesOf(state, pairId));
  return state.catalog.filter((b) => have.has(b.id));
}

export function toggleBadgeOn(state: RowBadgeState, pairId: string, badgeId: string): RowBadgeState {
  if (!state.catalog.some((b) => b.id === badgeId)) return state;
  const have = new Set(badgesOf(state, pairId));
  if (have.has(badgeId)) have.delete(badgeId);
  else have.add(badgeId);
  return withAssigned(state, pairId, [...have]);
}

function withAssigned(state: RowBadgeState, pairId: string, ids: string[]): RowBadgeState {
  const assigned = { ...state.assigned };
  if (ids.length === 0) delete assigned[pairId];
  else assigned[pairId] = ids;
  return { ...state, assigned };
}

/** All selected already have it → remove from all; otherwise add to those missing it. */
export function applyBadgeToIds(state: RowBadgeState, ids: readonly string[], badgeId: string): RowBadgeState {
  if (!state.catalog.some((b) => b.id === badgeId) || ids.length === 0) return state;
  const remove = ids.every((id) => badgesOf(state, id).includes(badgeId));
  return ids.reduce((next, pairId) => setBadgeOn(next, pairId, badgeId, !remove), state);
}

export function setBadgeOn(state: RowBadgeState, pairId: string, badgeId: string, on: boolean): RowBadgeState {
  if (!state.catalog.some((b) => b.id === badgeId)) return state;
  const have = new Set(badgesOf(state, pairId));
  if (on) have.add(badgeId);
  else have.delete(badgeId);
  const ids = [...have];
  const prev = badgesOf(state, pairId);
  if (prev.length === ids.length && prev.every((id) => have.has(id))) return state;
  return withAssigned(state, pairId, ids);
}

export function rowMatchesBadge(ids: readonly string[], want: BadgeFilter): boolean {
  if (want === "all") return true;
  if (want === "none") return ids.length === 0;
  if (want === "any") return ids.length > 0;
  return ids.includes(want);
}

export function applyState(value: unknown): RowBadgeState | null {
  if (!isRecord(value) || value.v !== ROW_BADGE_VERSION) return null;
  return parseRowBadgeState(value);
}

export function statesEqual(a: RowBadgeState, b: RowBadgeState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeLegacyStockId(id: string): string {
  return id.startsWith("stock:") ? id.slice("stock:".length) : id;
}

function migrateLegacyStockIds(state: RowBadgeState): RowBadgeState {
  const hasLegacy = state.catalog.some((b) => b.id.startsWith("stock:"));
  if (!hasLegacy) return state;
  const seen = new Set<string>();
  const catalog: RowBadge[] = [];
  for (const b of state.catalog) {
    const id = normalizeLegacyStockId(b.id);
    if (seen.has(id)) continue;
    seen.add(id);
    catalog.push(id === b.id ? b : { ...b, id });
  }
  const assigned: Record<string, string[]> = {};
  for (const [pairId, ids] of Object.entries(state.assigned)) {
    assigned[pairId] = [...new Set(ids.map(normalizeLegacyStockId))].filter((id) => seen.has(id));
  }
  return { ...state, catalog, assigned };
}

export function ensureHardcodedBadges(state: RowBadgeState): RowBadgeState {
  const clean = migrateLegacyStockIds(state);
  const byId = new Map(clean.catalog.map((b) => [b.id, b]));
  const hardcodedIds = new Set(HARDCODED_STOCK_BADGES.map((b) => b.id));
  const head = HARDCODED_STOCK_BADGES.map((b) => byId.get(b.id) ?? b);
  const rest = clean.catalog.filter((b) => !hardcodedIds.has(b.id));
  const nextCatalog = [...head, ...rest].slice(0, ROW_BADGE_MAX);
  const unchanged = clean === state
    && nextCatalog.length === state.catalog.length
    && nextCatalog.every((b, i) => b === state.catalog[i]);
  return unchanged ? state : { ...clean, catalog: nextCatalog };
}

export function ensureNamedBadge(
  state: RowBadgeState,
  name: string,
  preferredId?: string,
): { state: RowBadgeState; id: string | null } {
  const trimmed = normalizeName(name);
  if (trimmed === "") return { state, id: null };
  const existing = state.catalog.find(
    (b) => (preferredId !== undefined && b.id === preferredId) || b.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return { state, id: existing.id };
  if (state.catalog.length >= ROW_BADGE_MAX) return { state, id: null };
  const idTaken = preferredId !== undefined && state.catalog.some((b) => b.id === preferredId);
  const id = preferredId && !idTaken ? preferredId : nextBadgeId(state.catalog);
  const badge: RowBadge = { id, name: trimmed, color: nextBadgeColor(state.catalog) };
  return { state: { ...state, catalog: [...state.catalog, badge] }, id };
}

export function assignNamedBadge(
  state: RowBadgeState,
  pairId: string,
  name: string,
  preferredId?: string,
): RowBadgeState {
  const ensured = ensureNamedBadge(state, name, preferredId);
  return ensured.id ? setBadgeOn(ensured.state, pairId, ensured.id, true) : ensured.state;
}
