// paths.ts owns relative-path + output-path helpers (pure, one owner — RULE 22).

export function joinRel(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}

export function dirOf(relPath: string): string {
  const slash = relPath.lastIndexOf("/");
  return slash < 0 ? "" : relPath.slice(0, slash);
}

export function fileOf(relPath: string): string {
  const slash = relPath.lastIndexOf("/");
  return slash < 0 ? relPath : relPath.slice(slash + 1);
}

export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isImageExt(fileName: string, exts: string[]): boolean {
  return exts.includes(extOf(fileName));
}

export function isIgnoredDir(dirName: string, outputDir: string): boolean {
  return dirName === "_split_output" || dirName === outputDir;
}
