export interface StagedBuildResult { ok: boolean; stamp?: string; reason?: string; retry?: boolean }
export function buildAppStaged(options: { cmd: string; cwd: string; dist: string; appDirs: string[]; inherit?: boolean }): Promise<StagedBuildResult>;
export function appBuildRunning(): boolean;
