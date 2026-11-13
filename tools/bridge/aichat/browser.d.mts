import type { BrowserNaming } from "../webdriver/browser.mjs";
import type { AichatOpen } from "./pool.mjs";
type Env = Record<string, string | undefined>;
export const AICHAT_NAMING: BrowserNaming;
export function aichatProfileDir(env?: Env): string;
export function aichatHeaded(env?: Env): boolean;
export function aichatHealth(env?: Env): { ready: boolean; browser: string; headed: boolean; profile: string };
export function openChatBrowser(env?: Env): ReturnType<AichatOpen>;
