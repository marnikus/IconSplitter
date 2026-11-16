import { vi } from "vitest";
import { armCompletionSound } from "../../src/ui/completionSound";

/** Browser I/O only: real completion service decodes/queues this recording. */
export const completionAudio = { starts: [] as number[], resumes: 0 };
export function recordCompletionAudio(): void {
  completionAudio.starts.length = 0;
  completionAudio.resumes = 0;
  class RecordingAudio {
    state = "running";
    currentTime = 1;
    destination = {};
    async resume() { completionAudio.resumes++; }
    async decodeAudioData() { return { duration: 2 }; }
    createBufferSource() {
      return { buffer: null, connect() {}, start(at: number) { completionAudio.starts.push(at); } };
    }
  }
  vi.stubGlobal("AudioContext", RecordingAudio);
}
/** Forget the cues so far — a test still records with the same stub. */
export function clearCompletionAudio(): void {
  completionAudio.starts.length = 0;
}

/**
 * Spend any cue a previous screen left waiting (a mount-time scan, a preview run)
 * so a test that counts the cues of the action it starts sees only its own.
 */
export async function settleCompletionAudio(): Promise<void> {
  armCompletionSound();
  await flushCompletionAudio();
  completionAudio.starts.length = 0;
}

export async function flushCompletionAudio(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
