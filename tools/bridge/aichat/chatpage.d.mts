import type { ChatPage, ChatReading } from "./chatflow.mjs";
export function readChat(): ChatReading & { href: string };
export function focusComposer(): boolean;
export function clickSend(): { ok: boolean; reason?: string };
export function clickNewChat(): boolean;
export function stepSource(fn: () => unknown): string;
export function cdpChatPage(connection: unknown, sessionId: string): ChatPage;
