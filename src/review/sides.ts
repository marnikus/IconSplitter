// sides.ts — the shared shape of one comparison side (types only). The loader
// (detail.ts), the window state (useCompare.ts) and the panes agree on this.

export interface SideInfo {
  relPath: string;
  width: number;
  height: number;
  size: number;
  format: string;
}

/** One side as loaded for the comparison: a null side means "not on disk". */
export interface SideView {
  info: SideInfo | null;
  url: string | null;
  error: string | null;
}

export interface CompareSides {
  source: SideView | null;
  ai: SideView | null;
}

export interface CompareDetail {
  sides: CompareSides;
  busy: boolean;
}
