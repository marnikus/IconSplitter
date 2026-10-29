export interface GettyStageFile { name: string; path: string; size: number; mtimeMs: number }
export function inspectGettyBatch(folder: string): Promise<{ files: GettyStageFile[]; totalBytes: number }>;
export function snapshotGettyBatch(batch: { files: GettyStageFile[] }): Promise<{ files: string[]; cleanup: () => Promise<void> }>;
