import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import SvgImageProgress from "../src/svg/SvgImageProgress";
import { imageProgressStore, startImageProcess, updateImageProcess, finishImageProcess, stopImageProcess } from "../src/svg/imgprogress";
import type { SvgRefs } from "../src/svg/types";

const refs = () => ({}) as SvgRefs; // this store intentionally uses only session identity

describe("independent image process state", () => {
  it("keeps panels isolated and ignores a late event belonging to a previous run", () => {
    const a = refs(); const b = refs();
    expect(imageProgressStore(a).value).toBeNull();
    const listener = vi.fn(); imageProgressStore(a).listeners.add(listener);
    startImageProcess(a, { id: "first", total: 4, requests: 2 });
    updateImageProcess(a, "first", { saved: 1, failed: 1, request: 1 });
    stopImageProcess(a); finishImageProcess(a, "first", true);
    expect(imageProgressStore(a).value).toMatchObject({ saved: 1, failed: 1, phase: "stopped", stopping: true });
    expect(imageProgressStore(b).value).toBeNull();
    startImageProcess(a, { id: "new", total: 2, requests: 1 });
    finishImageProcess(a, "first", false);
    expect(imageProgressStore(a).value).toMatchObject({ id: "new", phase: "running", stopping: false, saved: 0 });
    expect(listener).toHaveBeenCalledTimes(5);
  });
  it("portals batch-style progress outside a hidden tab and restores it for a new process after dismissal", async () => {
    const identity = refs(); const stop = vi.fn();
    const host = document.createElement("div"); host.hidden = true;
    const mount = document.createElement("div"); mount.id = "svg-progress-mount";
    document.body.append(host, mount); const root = createRoot(host);
    try {
      await act(async () => { root.render(<SvgImageProgress refs={identity} onStop={stop} />); });
      expect(mount.children).toHaveLength(0);
      await act(async () => { startImageProcess(identity, { id: "a", total: 2, requests: 1 }); });
      expect(mount.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("0");
      expect(host.children).toHaveLength(0);
      await act(async () => { (mount.querySelector("button") as HTMLButtonElement).click(); });
      expect(stop).toHaveBeenCalledTimes(1);
      await act(async () => { updateImageProcess(identity, "a", { saved: 1, discarded: 1, request: 1 }); finishImageProcess(identity, "a", false); });
      expect(mount.textContent).toContain("2 completed / 2");
      expect(mount.textContent).toContain("1 saved · 0 failed · 1 discarded");
      await act(async () => { (mount.querySelector("button") as HTMLButtonElement).click(); });
      expect(mount.children).toHaveLength(0);
      await act(async () => { startImageProcess(identity, { id: "b", total: 3, requests: 3 }); });
      expect(mount.textContent).toContain("0 completed / 3");
    } finally { await act(async () => root.unmount()); host.remove(); mount.remove(); }
  });
});
