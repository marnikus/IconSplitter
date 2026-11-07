// select.ts — which icons fill the sheet (design §5.3), as one pure function.
//
// Invariants that matter more than the modes themselves:
//   * Deterministic. The pool is sorted by id before anything happens, so the
//     caller's scan order cannot change the sheet; the only randomness is the
//     seeded stream. Same request → same slots, always.
//   * Locks are positional. A locked icon keeps the CELL it was in, across a
//     re-roll and across a capacity change — a lock that moved would be a
//     different lock.
//   * No silent repeats. One icon appears once; when the pool cannot fill the
//     sheet the rest are holes and `shortfall` says how many. Filling them with
//     copies happens only when `repeat` is set, and then `repeated` says so.
//   * Nothing is guessed about tags: `basis` reports which tag source the score
//     actually used, so the UI can say "scored on file names".

import type { BuilderIcon } from "./rows";
import { seededPick, shuffleBySeed, streamOf } from "./rng";

export interface SelectionRequest {
  mode: "similar" | "random" | "filtered";
  pool: readonly BuilderIcon[];
  capacity: number;
  seed: number;
  /** Similar mode only: 0–100, the minimum tag-match percentage. */
  threshold: number;
  /** Filtered mode only: a folder path, "" = all. */
  folder: string;
  /** Filtered mode only: one tag, "" = all. */
  tag: string;
  /** Icons pinned to their current cell. */
  lockedIds: readonly string[];
  /**
   * The cell index each locked icon sits at, when the caller knows it. A lock with
   * no index (a fresh lock) keeps the index the previous sheet gave it, else the
   * first free one.
   */
  lockedAt?: Readonly<Record<string, number>>;
  /** Similar mode: the tag profile of the reference icon. */
  anchorTags?: readonly string[];
  /** Opt-in: reuse icons when the pool is smaller than the sheet. */
  repeat?: boolean;
  /** The previous sheet, so locks can keep their old positions. */
  previous?: readonly (string | null)[];
}

export interface SelectionResult {
  slots: (string | null)[];
  /** Cells that could not be filled — the UI must say so. */
  shortfall: number;
  /** True when icons were reused to fill the sheet (only with `repeat`). */
  repeated: boolean;
  /** Locked ids that are not in the pool any more: reported, never placed. */
  staleLocks: string[];
  /** Which tag source the similar score used. */
  basis: "metadata" | "filename" | "none";
}

/** The sheet's slots for this request. Never throws, never returns NaN holes. */
export function selectSlots(request: SelectionRequest): SelectionResult {
  const capacity = cellCount(request.capacity);
  const pool = orderedPool(request.pool);
  const locked = lockMap(request, capacity);
  const candidates = fillCandidates(request, pool, locked);
  const slots = newSlots(capacity, locked);
  fillFrom(slots, candidates, fillOrder(request, candidates));
  const shortfall = slots.filter((id) => id === null).length;
  return {
    slots: shortfall > 0 && request.repeat !== true ? withHolesAtEnd(slots) : slots,
    shortfall,
    repeated: request.repeat === true && pool.length < capacity,
    staleLocks: staleLockIds(request, pool),
    basis: basisOf(pool),
  };
}

/** A usable cell count: a finite, non-negative integer (NaN and negatives are 0). */
function cellCount(capacity: number): number {
  if (!Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.floor(capacity);
}

/** The pool sorted by id: the caller's order must not decide the sheet. */
function orderedPool(pool: readonly BuilderIcon[]): BuilderIcon[] {
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * id → cell index for every lock this sheet can honour. A lock whose old position
 * is unknown still gets placed (the first free cell) rather than being dropped: a
 * lock that vanishes silently is worse than a lock in an unexpected cell.
 */
function lockMap(request: SelectionRequest, capacity: number): Map<string, number> {
  const placed = new Map<string, number>();
  const known = new Set(request.pool.map((icon) => icon.id));
  for (const id of request.lockedIds) {
    // A lock on an icon the library no longer has cannot be honoured: it is
    // reported by `staleLocks` and never takes a cell.
    if (!known.has(id) || placed.has(id)) continue;
    const at = indexOfLock(id, request);
    if (at !== null && at < capacity) placed.set(id, at);
  }
  return claimFreeCells(placed, request.lockedIds.filter((id) => known.has(id)), capacity);
}

/** Gives every lock still without a cell the first one nobody has claimed. */
function claimFreeCells(placed: Map<string, number>, ids: readonly string[], capacity: number): Map<string, number> {
  for (const id of ids) {
    if (placed.has(id)) continue;
    const free = firstFreeCell(placed, capacity);
    if (free === null) break; // the sheet is already full of locks
    placed.set(id, free);
  }
  return placed;
}

function firstFreeCell(placed: ReadonlyMap<string, number>, capacity: number): number | null {
  const taken = new Set(placed.values());
  for (let cell = 0; cell < capacity; cell += 1) if (!taken.has(cell)) return cell;
  return null;
}

/** Where a lock sits: its declared index, else its previous cell. */
function indexOfLock(id: string, request: SelectionRequest): number | null {
  const declared = request.lockedAt?.[id];
  if (typeof declared === "number" && Number.isFinite(declared) && declared >= 0) return Math.floor(declared);
  const previous = request.previous === undefined ? -1 : request.previous.indexOf(id);
  return previous >= 0 ? previous : null;
}

/** The pool the free cells may draw from: filtered, ranked, and without locks. */
function fillCandidates(request: SelectionRequest, pool: BuilderIcon[], locked: Map<string, number>): BuilderIcon[] {
  const allowed = pool.filter((icon) => !locked.has(icon.id) && passesMode(icon, request));
  return orderedFor(request, allowed);
}

/** Whether an icon is eligible in this mode. */
function passesMode(icon: BuilderIcon, request: SelectionRequest): boolean {
  if (request.mode === "filtered") return inFolder(icon, request.folder) && hasTag(icon, request.tag);
  if (request.mode === "similar") return scoreOf(icon, request.anchorTags ?? []) >= request.threshold;
  return true;
}

function inFolder(icon: BuilderIcon, folder: string): boolean {
  return folder === "" || icon.folder === folder;
}

function hasTag(icon: BuilderIcon, tag: string): boolean {
  return tag === "" || icon.tags.includes(tag);
}

/**
 * The order free cells are drawn from. `similar` puts the best matches first so
 * the top-left of the sheet is the closest to the reference; the other modes are
 * already in a stable order and the seed does the choosing.
 */
function orderedFor(request: SelectionRequest, allowed: BuilderIcon[]): BuilderIcon[] {
  if (request.mode !== "similar") return allowed;
  const anchor = request.anchorTags ?? [];
  return [...allowed].sort((a, b) => scoreOf(b, anchor) - scoreOf(a, anchor) || (a.id < b.id ? -1 : 1));
}

/** The score of each candidate, in the order they were ranked in. */
function scoresOf(candidates: readonly BuilderIcon[], anchor: readonly string[]): number[] {
  return candidates.map((icon) => scoreOf(icon, anchor));
}

/** Percentage of the anchor's tags this icon shares (0 when there is nothing to compare). */
export function scoreOf(icon: BuilderIcon, anchorTags: readonly string[]): number {
  if (anchorTags.length === 0 || icon.tags.length === 0) return 0;
  const anchor = new Set(anchorTags);
  const hits = icon.tags.filter((tag) => anchor.has(tag)).length;
  return Math.round((hits / anchor.size) * 100);
}

/** The sheet with the locks already in their cells. */
function newSlots(capacity: number, locked: Map<string, number>): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: capacity }, () => null);
  for (const [id, at] of locked) slots[at] = id;
  return slots;
}

/**
 * Fills every empty cell from the seeded shuffle. Each icon is used at most once
 * unless `repeat` is set; the seed advances per cell, so a hole in one place does
 * not shift which icon lands in another.
 */
/** The order free cells draw from, plus whether reuse is allowed. */
interface FillOrder {
  order: BuilderIcon[];
  repeat: boolean;
  seed: number;
}

/**
 * `similar` fills in rank order (the best match goes top-left) and the seed only
 * breaks ties; every other mode draws from a full seeded shuffle, because there is
 * no ranking to preserve and the user expects a genuinely different sheet.
 */
function fillOrder(request: SelectionRequest, candidates: BuilderIcon[]): FillOrder {
  const seed = request.seed;
  const order = request.mode === "similar"
    ? rankedWithTies(candidates, scoresOf(candidates, request.anchorTags ?? []), seed)
    : shuffleBySeed(candidates, seed);
  return { order, repeat: request.repeat === true, seed };
}

/** Fills every empty cell; a lock keeps its own cell, a spent pool leaves holes. */
function fillFrom(slots: (string | null)[], candidates: BuilderIcon[], fill: FillOrder): void {
  void candidates;
  const used = new Set<string>();
  for (let cell = 0; cell < slots.length; cell += 1) {
    if (slots[cell] !== null) continue;
    const picked = nextFree(fill.order, used, fill.repeat, cell + fill.seed);
    if (picked === null) continue;
    slots[cell] = picked.icon.id;
    used.add(picked.icon.id);
  }
}

/**
 * The ranked order with a seeded tie-break: two icons that score the same swap
 * places between seeds, so a re-roll of a genuinely tied pool still moves — but a
 * better match always comes first.
 */
function rankedWithTies(candidates: readonly BuilderIcon[], scores: readonly number[], seed: number): BuilderIcon[] {
  const ordered: BuilderIcon[] = [];
  let at = 0;
  while (at < candidates.length) {
    const score = scores[at];
    const end = scoreBlockEnd(scores, at + 1, score);
    // One block of equal scores: the seed decides inside it, the score decides
    // between blocks — so a better match always comes earlier.
    ordered.push(...shuffleBySeed(candidates.slice(at, end), seed));
    at = end;
  }
  return ordered;
}

/** The first index after `from` whose score differs from `score`. */
function scoreBlockEnd(scores: readonly number[], from: number, score: number): number {
  let end = from;
  while (end < scores.length && scores[end] === score) end += 1;
  return end;
}

/** The next candidate for a cell, or null when the pool is spent. */
function nextFree(
  order: readonly BuilderIcon[], used: ReadonlySet<string>, repeat: boolean, cellSeed: number,
): { icon: BuilderIcon; forced: boolean } | null {
  const fresh = order.find((icon) => !used.has(icon.id));
  if (fresh !== undefined) return { icon: fresh, forced: false };
  if (!repeat || order.length === 0) return null;
  return { icon: order[seededPick(order.length, cellSeed)], forced: true };
}

/**
 * Holes sort to the end of the sheet when the pool ran out: a half-filled sheet
 * with a gap in the middle looks like a design decision, and it is not one.
 */
function withHolesAtEnd(slots: readonly (string | null)[]): (string | null)[] {
  return [...slots.filter((id): id is string => id !== null), ...slots.filter((id) => id === null)];
}

/** Locked ids the pool no longer contains: the UI reports them, it cannot honour them. */
function staleLockIds(request: SelectionRequest, pool: readonly BuilderIcon[]): string[] {
  const known = new Set(pool.map((icon) => icon.id));
  return request.lockedIds.filter((id) => !known.has(id));
}

/** The tag source the similar score is built on — the most honest one present. */
function basisOf(pool: readonly BuilderIcon[]): SelectionResult["basis"] {
  if (pool.some((icon) => icon.tagSource === "metadata")) return "metadata";
  if (pool.some((icon) => icon.tagSource === "filename")) return "filename";
  return "none";
}

/** A random seed for a NEW sheet: the only place a clock may be read. */
export function freshSeed(now: number): number {
  const next = streamOf(Math.max(1, Math.floor(now)))();
  return Math.max(1, Math.floor(next * 0x7fffffff));
}
