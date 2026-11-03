export interface ChatReply { id: string; text: string; file: boolean }
export interface ChatReading {
  signedIn: boolean; ready: boolean; busy: boolean; attached: boolean;
  reply: ChatReply | null; href?: string;
}
export interface ChatPage {
  open(url: string): Promise<void>;
  read(): Promise<ChatReading>;
  attach(file: string): Promise<{ ok: boolean; reason?: string }>;
  type(text: string): Promise<boolean>;
  submit(): Promise<{ ok: boolean }>;
  newChat(): Promise<void>;
  href(): Promise<string>;
}
export interface ChatTurnInput { url: string; prompt: string; imagePath: string; maxWaitMs: number; readyTimeoutMs: number }
export interface ChatTurnOptions {
  pollMs?: number; attachTimeoutMs?: number; stableReads?: number; submitTimeoutMs?: number;
  onPhase?: (phase: string) => void; signal?: AbortSignal;
}
export type ChatTurnResult =
  | { ok: true; text: string; chatUrl: string; restarted: boolean }
  | { ok: false; code: string; reason: string; restarted?: boolean };
export function chatUrlOf(raw: unknown): string | null;
export function chatIdOf(raw: unknown): string | null;
export function replyProgress(
  prev: { text: string | null; same: number; done: boolean } | null,
  reading: { busy: boolean; reply: ChatReply | null },
  baseline: string | null,
  stable: number,
): { text: string | null; same: number; done: boolean; reply?: ChatReply };
export function runChatTurn(page: ChatPage, input: ChatTurnInput, options?: ChatTurnOptions): Promise<ChatTurnResult>;
