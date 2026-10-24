// Local-only completion audio: the supplied recording is embedded, never fetched.
import { readKey, writeKey } from "../state/safestorage";
import asset from "../../tests/assets/Sound/universfield-new-notification-037-485898.mp3?inline";
const KEY = "iconSplitter.process.sound.v1";
const heard = new Set<string>();
let audio: AudioContext | null = null;
let decoded: Promise<AudioBuffer | null> | null = null;
let nextAt = 0;

export const completionSoundLabel = "universfield-new-notification-037-485898.mp3";
export const completionSoundEnabled = (): boolean => readKey(KEY) !== "off";
export const setCompletionSound = (enabled: boolean): void => { writeKey(KEY, enabled ? "on" : "off"); };

/** Call in the confirm/test click, before async preparation loses the gesture. */
export function armCompletionSound(): boolean {
  if (!completionSoundEnabled()) return false;
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => undefined);
    decoded ??= decodeAsset(audio);
    return true;
  } catch { return false; }
}

async function decodeAsset(context: AudioContext): Promise<AudioBuffer | null> {
  try {
    const bytes = Uint8Array.from(atob(asset.slice(asset.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    return await context.decodeAudioData(bytes.buffer);
  } catch { return null; }
}

/** Once per actual process, never on mount, refusal, drop or cancellation. */
export function notifyCompletion(id: string, cancelled = false): void {
  if (heard.has(id)) return;
  heard.add(id);
  if (!cancelled && completionSoundEnabled()) void playCompletionSound();
}

/** A browser's autoplay refusal must never reject or roll back completed work. */
export async function playCompletionSound(): Promise<boolean> {
  try {
    if (audio === null) return false;
    if (audio.state !== "running") await audio.resume();
    if (audio.state !== "running") return false;
    const buffer = await decoded;
    const start = Math.max(audio.currentTime, nextAt);
    if (buffer === null) return false;
    playBuffer(audio, buffer, start);
    nextAt = start + buffer.duration + 0.1;
    return true;
  } catch { return false; }
}

function playBuffer(context: AudioContext, buffer: AudioBuffer, start: number): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(start);
}
