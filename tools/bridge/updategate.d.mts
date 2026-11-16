export interface GateDecision { ready: boolean; reason: "settling" | "git-busy" | "uncommitted" | "ok"; dirty?: string[] }
export function createSettle(quietMs: number, now?: () => number): { observe(stamp: string): boolean };
export function gateDecision(input: { settled: boolean; gitBusy: boolean; dirty: string[] | null; mode?: "commit" | "save" }): GateDecision;
export function uncommittedUnder(watchedPaths: string[]): Promise<string[] | null>;
export function gitOperationInProgress(watched: string): Promise<boolean>;
export function updateMode(env?: Record<string, string | undefined>): "commit" | "save";
export function createUpdateGate(options: { paths: string[]; quietMs: number; mode?: "commit" | "save"; now?: () => number }): { check(stamp: string): Promise<GateDecision> };
export function waitingNote(what: string, decision: GateDecision): string | null;
