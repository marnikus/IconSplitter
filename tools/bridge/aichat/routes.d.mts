export const AICHAT_MAX_BODY: number;
export function parseSendBody(text: unknown):
  | { ok: true; input: { url: string; prompt: string; image: Buffer | null; maxWaitMs: number; readyTimeoutMs: number; stepDelayMs: number; anchor: string; sessionKey: string } }
  | { ok: false; reason: string };
export function statusOfCode(code: string): number;
export function aichatHealth(env?: Record<string, string | undefined>): { ready: boolean; browser: string; headed: boolean; profile: string };
export function aichatBusy(): boolean;
export function handleAichatSend(req: any, res: any, post: any, json: any): Promise<any>;
export function handleAichatProgress(req: any, res: any, json: any): any;
export function handleAichatCancel(req: any, res: any, post: any, json: any): Promise<any>;
export function handleAichatClose(req: any, res: any, post: any, json: any): Promise<any>;
