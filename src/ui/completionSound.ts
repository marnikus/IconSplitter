// Local-only completion audio: the supplied recording is embedded, never fetched.
import { readKey, writeKey } from "../state/safestorage";
import asset from "../../tests/assets/Sound/universfield-new-notification-037-485898.mp3?inline";
const KEY = "iconSplitter.process.sound.v1";
const heard = new Set<string>();
/**
 * Cues the browser would not play yet (audio not armed, context suspended, a tab
 * that was hidden). They are kept, not dropped: the next gesture arms the context
 * and one replay makes the finished bar audible — the "sometimes no sound" fix.
 */
const deferred = new Set<string>();
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
    replayDeferred();
    return true;
  } catch { return false; }
}

/** A refused cue is played once here — after any gesture, so the bar is still heard. */
function replayDeferred(): void {
  if (deferred.size === 0) return;
  deferred.clear();
  void playCompletionSound();
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
  if (cancelled || !completionSoundEnabled()) return;
  void playCompletionSound().then((played) => { if (!played) deferred.add(id); });
}

/**
 * A finished bar asks for the cue only if nobody has claimed this process yet: the
 * feature itself (a run, an upload) keeps ownership, and the bar is the safety net
 * for the flows that never call the sound service at all.
 */
export function notifyBarCompletion(id: string, silent = false): void {
  if (heard.has(id)) return;
  notifyCompletion(id, silent);
}

/** How many cues wait for a gesture — the sound test and tests read this. */
export const deferredCueCount = (): number => deferred.size;

/** Capture one actual run; arm before async work can lose user activation. */
export function startCompletionSound(id: string = crypto.randomUUID()): (cancelled?: boolean) => void {
  armCompletionSound();
  return (cancelled = false) => notifyCompletion(id, cancelled);
}

/** A terminal task cue, preserving its result/error and ignoring picker cancellation. */
export async function withCompletionSound<T>(work: () => Promise<T>): Promise<T> {
  const finish = startCompletionSound();
  let cancelled = false;
  try {
    const result = await work();
    cancelled = result === false;
    return result;
  } catch (error) {
    cancelled = (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
    throw error;
  } finally { finish(cancelled); }
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
