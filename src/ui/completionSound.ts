// Local-only completion audio. Vite embeds the requested MP3 when it exists;
// an absent asset is explicitly labelled as a built-in tone, never fetched.
import { readKey, writeKey } from "../state/safestorage";
const assets = import.meta.glob<string>("/tests/assets/Sound/universfield-new-notification-037-485898.mp3", { eager: true, query: "?inline", import: "default" });
const asset = Object.values(assets)[0] ?? null;
const KEY = "iconSplitter.process.sound.v1";
const heard = new Set<string>();
let audio: AudioContext | null = null;
let decoded: Promise<AudioBuffer | null> | null = null;
let nextAt = 0;

export const completionSoundLabel = asset === null ? "Built-in tone (requested MP3 not found)" : "universfield-new-notification-037-485898.mp3";
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
  if (asset === null) return null;
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
    if (buffer) playBuffer(audio, buffer, start);
    else playTone(audio, start);
    nextAt = start + (buffer?.duration ?? 0.45) + 0.1;
    return true;
  } catch { return false; }
}

function playBuffer(context: AudioContext, buffer: AudioBuffer, start: number): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(start);
}

function playTone(context: AudioContext, start: number): void {
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.frequency.value = 880;
  gain.gain.setValueAtTime(0.12, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
  tone.connect(gain);
  gain.connect(context.destination);
  tone.start(start);
  tone.stop(start + 0.45);
}
