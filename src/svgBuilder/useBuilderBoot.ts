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

export function useBuilderBoot(patch: (value: Partial<BuilderModel>) => void, supported: boolean): BuilderBoot {
  const scanRefs = useRef<BuilderScanRefs>({ seq: { ...SCAN_IDLE } as ScanSeq, scanKey: { current: null } });
  const setRoot = (root: DirHandleLike | null) => patch({ root, svgTexts: {} });
  const setDiscovery = (discovery: BuilderDiscovery | null) => patch({ discovery, svgTexts: {} });
  const setBusy = (busy: string | null) => patch({ busy });
  const say = (status: string, error = false) => patch({ status, error });
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      try {
        const root = await bootBuilderRoot();
        if (!alive || root === null) return;
        await scanBuilderRoot(scanRefs.current, root, { setRoot, setDiscovery, setBusy, say, setIconMap: (iconMap) => patch({ iconMap }) });
      } catch {
        if (alive) say("Saved folder could not be restored — open it again", true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);
  useEffect(() => {
    let alive = true;
    void readGeminiKey().then((read: KeyRead) => { if (alive) patch({ key: keyInfoOf(read) }); })
      .catch(() => { if (alive) patch({ key: keyInfoOf({ key: null, source: "unreadable" }) }); });
    return () => { alive = false; };
  }, [patch]);
  return { scanRefs, setRoot, setDiscovery, setBusy, say };
}
