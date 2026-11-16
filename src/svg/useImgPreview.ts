// useImgPreview.ts — prepare and revoke the exact multipart images shown by
// the AI source edit confirmation. Nothing leaves the browser until Generate.

import { useEffect, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { sameImageSelection } from "../lib/svgimgbatch";
import type { Connection } from "../lib/svgconnections";
import { prepareImageEditRun, type PreparedImageRun } from "./imgprepare";
import type { SvgRow } from "./types";

export interface ImagePreviewInput {
  rootRef: { current: DirHandleLike | null };
  rows: SvgRow[];
  ids: readonly string[];
  conn: Connection;
  prompt: string;
  count: number;
  active: boolean;
}
export interface ImagePreview {
  run: PreparedImageRun | null;
  urls: string[];
  loading: boolean;
  error: string | null;
}

export function useImgPreview(input: ImagePreviewInput): ImagePreview {
  const [state, setState] = useState<ImagePreview>({ run: null, urls: [], loading: false, error: null });
  const root = input.rootRef.current;
  const { rows, ids, conn, prompt, count, active } = input;
  useEffect(() => {
    if (!active) return;
    let live = true;
    const urls: string[] = [];
    setState({ run: null, urls: [], loading: true, error: null });
    if (root === null) setState({ run: null, urls: [], loading: false, error: "Pick the source folder again" });
    else void prepareImageEditRun({ root, rows, ids, conn, prompt, count }).then((run) => {
      if (!live) return;
      for (const group of run.groups) urls.push(URL.createObjectURL(group.reference));
      setState({ run, urls: [...urls], loading: false, error: null });
    }).catch((error: unknown) => {
      if (live) setState({ run: null, urls: [], loading: false, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [root, rows, ids, conn, prompt, count, active]);
  if (!active) return { run: null, urls: [], loading: false, error: null };
  if (state.run !== null && !matchesPreview(state.run, input, root)) {
    return { run: null, urls: [], loading: true, error: null };
  }
  return state;
}

function matchesPreview(run: PreparedImageRun, input: ImagePreviewInput, root: DirHandleLike | null): boolean {
  return run.root === root && run.prompt === input.prompt && run.count === input.count
    && sameImageSelection(run.ids, input.ids) && sameImageConnection(run.conn, input.conn);
}

function sameImageConnection(a: Connection, b: Connection): boolean {
  return a.id === b.id && a.model === b.model && a.name === b.name
    && a.baseUrl === b.baseUrl && JSON.stringify(a.image) === JSON.stringify(b.image);
}
