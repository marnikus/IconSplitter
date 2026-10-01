// AppChrome.tsx — the top bar's right-hand slot. The Workbench owns the bar
// (brand, tabs, help); a panel can publish its own status there (the Selection
// tab shows the watcher pill) without lifting its state into the shell.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Publish = (node: ReactNode) => void;

const ChromeContext = createContext<Publish>(() => {});

export function ChromeProvider({ children }: { children: (slot: ReactNode) => ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);
  return <ChromeContext.Provider value={setSlot}>{children(slot)}</ChromeContext.Provider>;
}

/**
 * Publishes a node into the app bar. Call it from an effect keyed on
 * primitives, so the node is created once per real change (no render loops).
 */
export function useAppChrome(node: ReactNode, deps: unknown[]): void {
  const publish = useContext(ChromeContext);
  useEffect(() => {
    publish(node);
    return () => publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, ...deps]);
}
