// Selection belongs to the lightweight row shell, not its preview/content tree.
// Stable event bridges call the latest COMMITTED handler; data props remain reactive.
import { useLayoutEffect, useRef } from "react";

type Event = (...args: never[]) => unknown;

/** Shallow data comparison; Batch's processing mirror is the sole ignored field. */
export function sameRowData(a: object, b: object, ignored?: string): boolean {
  if (a === b) return true;
  const keys = Object.keys(a).filter((key) => key !== ignored);
  if (keys.length !== Object.keys(b).filter((key) => key !== ignored).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(Reflect.get(a, key), Reflect.get(b, key)));
}

/** Function-valued render dependencies (e.g. a thumbnail loader) opt out of bridging. */
export function useRowPresentation<T extends object>(props: T, reactive: readonly (keyof T)[] = []): T {
  const live = useRef(props);
  useLayoutEffect(() => { live.current = props; });
  const events = useRef(new Map<string, (...args: unknown[]) => unknown>());
  const snapshot = Object.fromEntries(Object.entries(props).map(([key, value]) => {
    if (typeof value !== "function" || reactive.includes(key as keyof T)) return [key, value];
    if (!events.current.has(key)) {
      events.current.set(key, (...args: unknown[]) => Reflect.apply(Reflect.get(live.current, key) as Event, undefined, args));
    }
    return [key, events.current.get(key)];
  })) as T;
  const stable = useRef(snapshot);
  if (!sameRowData(stable.current, snapshot)) stable.current = snapshot;
  return stable.current;
}
