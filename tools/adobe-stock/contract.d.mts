export interface Asset { id: string; originalName: string; title: string; keywords: string[]; thumbnailUrl: string }
export interface Expected { title: string; tags: string[] }
export const ADOBE_ORIGIN: string;
export const SELECTORS: { file: string; title: string; keywords: string; tile: string };
export function findAssets(value: unknown): Asset[];
export function parseSavedAssets(html: string): Asset[];
export function metadataMatches(asset: Pick<Asset,"title"|"keywords">, expected: Expected): boolean;
export function validateTarget(cdp: string, page: string, allowUpload: boolean): void;
export function validateManifest(value: unknown): { path: string; metadata: Expected }[];
export function checkFileCarriers(name: string, bytes: Uint8Array): void;
