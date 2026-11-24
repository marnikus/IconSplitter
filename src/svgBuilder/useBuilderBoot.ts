// useBuilderBoot.ts — restore this tab's remembered root and shared key, and
// provide the one scan-ticket ref plus the plain scan setters.
import { useEffect, useRef } from "react";
import { SCAN_IDLE, type ScanSeq } from "../lib/scanseq";
import type { DirHandleLike } from "../lib/fs";
import type { KeyRead } from "../lib/keyvault";
import { readGeminiKey } from "../upload/keystore";
import { keyInfoOf } from "./model";
import type { BuilderModel } from "./model";
import { bootBuilderRoot, scanBuilderRoot, type BuilderScanRefs } from "./scan";
import type { BuilderDiscovery } from "./discovery";

export interface BuilderBoot {
  scanRefs: { current: BuilderScanRefs };
  setRoot: (root: DirHandleLike | null) => void;
  setDiscovery: (found: BuilderDiscovery | null) => void;
  setBusy: (busy: string | null) => void;
  say: (message: string, error?: boolean) => void;
}

interface RestoreArgs {
  scanRefs: { current: BuilderScanRefs };
  setters: Pick<BuilderBoot, "setRoot" | "setDiscovery" | "setBusy" | "say">;
  patch: (value: Partial<BuilderModel>) => void;
  supported: boolean;
}

/** The remembered folder, rescanned at start; `booting` ends either way (2026-11-15: pictures wait for it). */
function useRestoredRoot({ scanRefs, setters, patch, supported }: RestoreArgs): void {
  useEffect(() => {
    if (!supported) { patch({ booting: false }); return; }
    let alive = true;
    void (async () => {
      try {
        const root = await bootBuilderRoot();
        if (!alive || root === null) return;
        await scanBuilderRoot(scanRefs.current, root, { ...setters, setIconMap: (iconMap) => patch({ iconMap }) });
      } catch {
        if (alive) setters.say("Saved folder could not be restored — open it again", true);
      } finally {
        if (alive) patch({ booting: false });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);
}

export function useBuilderBoot(patch: (value: Partial<BuilderModel>) => void, supported: boolean): BuilderBoot {
  const scanRefs = useRef<BuilderScanRefs>({ seq: { ...SCAN_IDLE } as ScanSeq, scanKey: { current: null } });
  const statusSeqRef = useRef(0);
  const setRoot = (root: DirHandleLike | null) => patch({ root, svgTexts: {} });
  const setDiscovery = (discovery: BuilderDiscovery | null) => patch({ discovery, svgTexts: {} });
  const setBusy = (busy: string | null) => patch({ busy });
  const say = (status: string, error = false) => { statusSeqRef.current += 1; patch({ status, statusSeq: statusSeqRef.current, error }); };
  useRestoredRoot({ scanRefs, setters: { setRoot, setDiscovery, setBusy, say }, patch, supported });
  useEffect(() => {
    let alive = true;
    void readGeminiKey().then((read: KeyRead) => { if (alive) patch({ key: keyInfoOf(read) }); })
      .catch(() => { if (alive) patch({ key: keyInfoOf({ key: null, source: "unreadable" }) }); });
    return () => { alive = false; };
  }, [patch]);
  return { scanRefs, setRoot, setDiscovery, setBusy, say };
}
