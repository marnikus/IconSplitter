// gettywebfinish.ts — submits the run's one Getty web batch after the last icon.

import {
  finishBridgeGettyWeb, type GettyWebFinishInput, type GettyWebResult,
} from "../lib/stockupload/gettywebclient";
import { completionNote } from "./gettywebtransfer";

export interface GettyFinishInput extends GettyWebFinishInput {
  /** Icons handed to the batch page; nothing is submitted when none arrived. */
  uploaded: number;
  finishFn?: (input: GettyWebFinishInput) => Promise<GettyWebResult>;
}

export interface GettyFinishOutcome {
  submitted: boolean;
  note: string | null;
  error: string | null;
}

/**
 * One batch holds every icon, so the target is submitted once, after the last
 * upload. Submitting per icon used to lock the batch and drop the remaining icons.
 */
export async function finishGettyWebRun(input: GettyFinishInput): Promise<GettyFinishOutcome> {
  const { uploaded, finishFn, ...request } = input;
  if (uploaded === 0) return { submitted: false, note: null, error: null };
  const res = await (finishFn ?? finishBridgeGettyWeb)(request);
  // A refused finish keeps its own reason: it names what is missing on the page.
  if (!res.ok) return { submitted: false, note: null, error: res.reason };
  const note = completionNote(res);
  return { submitted: res.completed !== false, note, error: null };
}
