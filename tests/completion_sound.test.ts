import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

function fakeAudio(initiallySuspended = false, buffer = true) {
  const starts: number[] = [];
  const decodedBytes: Uint8Array[] = [];
  const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  class Audio {
    state = initiallySuspended ? "suspended" : "running";
    currentTime = 10;
    destination = {};
    resume = vi.fn(async () => { await Promise.resolve(); this.state = "running"; });
    decodeAudioData = (bytes: ArrayBuffer) => {
      if (!buffer) throw new Error("decoder unavailable");
      decodedBytes.push(new Uint8Array(bytes));
      return Promise.resolve({ duration: 2 });
    };
    createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: (at: number) => starts.push(at) });
    createGain = () => gain;
    createOscillator = () => ({ frequency: { value: 0 }, connect: vi.fn(), start: (at: number) => starts.push(at), stop: vi.fn() });
  }
  vi.stubGlobal("AudioContext", Audio);
  return { starts, decodedBytes };
}

describe("completion sound", () => {
  it("is silent at import/arming, plays once per finished process and never overlaps cues", async () => {
    const { starts } = fakeAudio();
    const sound = await import("../src/ui/completionSound");
    expect(starts).toEqual([]);
    expect(sound.armCompletionSound()).toBe(true);
    expect(starts).toEqual([]);
    sound.notifyCompletion("svg-a"); sound.notifyCompletion("svg-a"); sound.notifyCompletion("image-b");
    await Promise.resolve(); await Promise.resolve();
    expect(starts).toHaveLength(2);
    expect(starts[0]).toBe(10);
    expect(starts[1]).toBeCloseTo(12.1, 8);
    sound.notifyCompletion("cancelled", true);
    await Promise.resolve(); await Promise.resolve();
    expect(starts).toHaveLength(2);
  });
  it("the first Test sound click waits for asynchronous browser audio activation", async () => {
    const { starts } = fakeAudio(true);
    const sound = await import("../src/ui/completionSound");
    sound.armCompletionSound();
    expect(await sound.playCompletionSound()).toBe(true);
    expect(starts).toEqual([10]);
  });
  it("embeds the exact supplied MP3 bytes and serializes decoded recordings, not fallback tones", async () => {
    const { starts, decodedBytes } = fakeAudio(false, true);
    const sound = await import("../src/ui/completionSound");
    expect(sound.completionSoundLabel).toBe("universfield-new-notification-037-485898.mp3");
    sound.armCompletionSound();
    expect(await sound.playCompletionSound()).toBe(true);
    expect(await sound.playCompletionSound()).toBe(true);
    const supplied = readFileSync("tests/assets/Sound/universfield-new-notification-037-485898.mp3");
    expect(decodedBytes).toHaveLength(1);
    expect(Array.from(decodedBytes[0])).toEqual(Array.from(supplied));
    expect(starts[0]).toBe(10);
    expect(starts[1]).toBeCloseTo(12.1, 8);
  });
  it("persists mute and does not replay muted completions after enabling", async () => {
    const { starts } = fakeAudio();
    const sound = await import("../src/ui/completionSound");
    sound.setCompletionSound(false);
    expect(sound.completionSoundEnabled()).toBe(false);
    expect(sound.armCompletionSound()).toBe(false);
    sound.notifyCompletion("muted");
    sound.setCompletionSound(true); sound.armCompletionSound();
    sound.notifyCompletion("muted"); sound.notifyCompletion("new");
    await Promise.resolve(); await Promise.resolve();
    expect(starts).toEqual([10]);
    expect(sound.completionSoundLabel).toMatch(/Built-in tone|universfield-new-notification/);
  });
  it("reports unavailable decoding without pretending the requested recording played", async () => {
    const { starts } = fakeAudio(false, false);
    const sound = await import("../src/ui/completionSound");
    sound.armCompletionSound();
    expect(await sound.playCompletionSound()).toBe(false);
    expect(starts).toEqual([]);
  });
  it("handles unsupported or blocked audio without rejecting work", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const sound = await import("../src/ui/completionSound");
    expect(sound.armCompletionSound()).toBe(false);
    sound.notifyCompletion("no-audio");
    expect(await sound.playCompletionSound()).toBe(false);
    class Suspended { state = "suspended"; resume = () => Promise.reject(new Error("blocked")); }
    vi.stubGlobal("AudioContext", Suspended);
    expect(sound.armCompletionSound()).toBe(true);
    expect(await sound.playCompletionSound()).toBe(false);
  });
});
