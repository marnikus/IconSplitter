// userootpath.ts — the remembered full path of a root, as a live React value
// (I-36). Storage (lib/rootpath) is the single source of truth: when a picker in
// any tab captures a path, every subscriber re-reads, so the path rows show it
// without a reload and a pick in one tab updates the other.

import { useSyncExternalStore } from "react";
import { loadRootPath, rootPathRevision, subscribeRootPaths } from "../lib/rootpath";

/** The full path of `rootName`, re-read whenever any tool captures one. */
export function useRootPath(rootName: string): string {
  useSyncExternalStore(subscribeRootPaths, rootPathRevision, rootPathRevision);
  return loadRootPath(rootName);
}
