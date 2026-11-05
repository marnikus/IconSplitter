import type { ChatPage, ChatTurnOptions, ChatTurnResult } from "./chatflow.mjs";
export interface AichatInput {
  url: string; prompt: string; image: Buffer | null; maxWaitMs: number; readyTimeoutMs: number; stepDelayMs?: number; anchor?: string;
  sessionKey?: string; signal?: AbortSignal;
}
export type AichatOpen = () => Promise<
  | { ok: true; page: ChatPage; close: () => void; closed?: () => boolean }
  | { ok: false; code: string; reason: string }
>;
export interface Aichat {
  busy(): boolean;
  progress(key: string): { phase: string; at: number } | null;
  cancel(key: string): boolean;
  close(): void;
  send(input: AichatInput): Promise<ChatTurnResult | { ok: false; code: string; reason: string }>;
}
export function createAichat(deps: { open: AichatOpen; turnOptions?: ChatTurnOptions }): Aichat;
