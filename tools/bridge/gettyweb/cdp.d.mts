export function stepExpression(prelude: string, stepSource: string, arg?: unknown): string;
export interface CdpConnection {
  ready: Promise<void>;
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  on(method: string, handler: (params: any, sessionId?: string) => void): void;
  close(): void;
  readonly closed: string | null;
}
export function openCdp(url: string, options?: { WebSocketImpl?: unknown; timeoutMs?: number }): CdpConnection;
export function evaluate(connection: CdpConnection, expression: string, sessionId?: string): Promise<any>;
export function runStep(connection: CdpConnection, prelude: string, stepSource: string, arg: unknown, sessionId?: string): Promise<any>;
export function waitFor(connection: CdpConnection, expression: string, options?: { timeoutMs?: number; intervalMs?: number; sessionId?: string }): Promise<{ ok: boolean; value: any }>;
export function navigate(connection: CdpConnection, url: string, sessionId?: string): Promise<any>;
export function setFiles(connection: CdpConnection, files: string[], options?: { selector?: string; index?: number; sessionId?: string }): Promise<{ ok: boolean; reason: string | null }>;
