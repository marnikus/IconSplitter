import { vi } from "vitest";

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
export async function flushCompletionAudio(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
