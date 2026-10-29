import type { Page } from "playwright";
export function openGettyBatchList(page: Page): Promise<void>;
export function createGettyBatch(page: Page, batchName: string): Promise<void>;
export function injectGettyFiles(page: Page, files: string[], batchId: string): Promise<void>;
export function getGettyBatchId(address: string): string | null;
