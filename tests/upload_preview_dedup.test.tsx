// Real export preparation, duplicated preview subscribers, real debounce timers.
// Fake time controls scheduling only; geometry/settings/output are never mocked.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import * as prepare from "../src/lib/upload/prepare";
import { PREVIEW_DEBOUNCE_MS, useExportPreview } from "../src/upload/exportpreview";

let root: Root, host: HTMLDivElement;
const settings = { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2 };
const svg = (name: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>${name}</title><path d="M4 4h24v24H4z" fill="none" stroke="#333"/></svg>`;
function Previews({ sources }: { sources: string[] }) {
  return <>{sources.map((source, i) => <Preview key={i} source={source} />)}</>;
}
function Preview({ source }: { source: string }) {
  const shown = useExportPreview(source, settings);
  return <output data-note={shown.note ?? ""}>{shown.svg}</output>;
}
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});

it("prepares a shared cold key once even when every row already scheduled its debounce", async () => {
  const source = svg("shared-cold-key");
  const expected = prepare.prepareExportSvg(source, settings);
  expect(expected.ok).toBe(true);
  const spy = vi.spyOn(prepare, "prepareExportSvg");
  await act(async () => root.render(<Previews sources={Array(20).fill(source)} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS); });
  expect(spy.mock.calls.length).toBe(1);
  expect([...host.querySelectorAll("output")].every((el) => el.textContent === (expected.ok ? expected.svg : ""))).toBe(true);
  expect(host.querySelectorAll("output")).toHaveLength(20);
});

it("keeps distinct keys distinct and never prepares a superseded or unmounted source", async () => {
  const spy = vi.spyOn(prepare, "prepareExportSvg");
  await act(async () => root.render(<Previews sources={[svg("superseded"), svg("other")]} />));
  await act(async () => root.render(<Previews sources={[svg("latest"), svg("other")]} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS); });
  expect(spy.mock.calls.map(([source]) => source)).toEqual([svg("other"), svg("latest")]);
  await act(async () => root.render(<Previews sources={[svg("unmounted")]} />));
  await act(async () => root.render(<Previews sources={[]} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS); });
  expect(spy.mock.calls.length).toBe(2);
});
