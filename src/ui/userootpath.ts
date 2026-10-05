// userootpath.ts — the remembered full path of a root, as a live React value
// (I-36). Storage (lib/rootpath) is the single source of truth: when a picker in
// any tab captures a path, every subscriber re-reads, so the root pills and the
// fields show it without a reload.

import { useSyncExternalStore } from "react";
import { loadRootPathInfo, rootPathRevision, subscribeRootPaths, type PathHow } from "../lib/rootpath";

export interface RootPath {
  path: string;
  how: PathHow | null;
}

/** The full path of `rootName`, re-read whenever any tool captures one. */
export function useRootPath(rootName: string): RootPath {
  useSyncExternalStore(subscribeRootPaths, rootPathRevision, rootPathRevision);
  return loadRootPathInfo(rootName);
}

/** What a root's label shows: the full path once known, else its folder name. */
export function useRootLabel(rootName: string): string {
  const stored = useRootPath(rootName);
  return stored.path === "" ? rootName : stored.path;
}
