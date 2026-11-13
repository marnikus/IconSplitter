import type { ChatPage, ChatReading } from "./chatflow.mjs";
export function readChat(anchor?: string): ChatReading & { href: string };
export function focusComposer(): boolean;
export function clickSend(): { ok: boolean; reason?: string };
export function clickNewChat(): boolean;
export function clickReplyCopy(anchor?: string): boolean;
export function pickAnswer(anchor?: string): { el: Element | null; n: number; count: number | null; next: Element | null };
export function stepSource(fn: (arg?: any) => unknown, arg?: unknown): string;
export function cdpChatPage(connection: unknown, sessionId: string): ChatPage;
