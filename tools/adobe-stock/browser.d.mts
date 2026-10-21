import type { Asset, Expected } from "./contract.mjs";
interface Response { url(): string; ok(): boolean; headers(): Record<string,string>; json(): Promise<unknown> }
interface EventPage { on(event: string, handler: (r: Response)=>Promise<void>): void; off(event: string, handler: (r: Response)=>Promise<void>): void }
export function watchAsset(page: EventPage, uniqueName: string, expected: Expected, timeout: number): {ready: Promise<Asset>; stop():void};
