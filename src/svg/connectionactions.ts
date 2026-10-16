// connectionactions.ts — the quick-switch actions of the saved provider setups
// (2026-10-16). Every change funnels into ONE reducer action ("connections"),
// which is also the single writer that keeps the live config's base+model in
// step — the dropdown and the runner cannot drift apart. The list math is pure;
// the hook only memoizes the dispatches (RULE 16/18).

import { useCallback, useRef } from "react";
import {
  defaultImageConnection, newConnectionId, sanitizeImage,
  type Connection, type ConnectionKind, type ConnectionsStore,
} from "../lib/svgconnections";
import type { SvgModel } from "./statemodel";
import type { SvgCtx, Slice } from "./actions";

type Edit = (m: SvgModel) => ConnectionsStore;

const switched = (m: SvgModel, id: string): ConnectionsStore =>
  ({ list: m.connections, activeId: m.connections.some((c) => c.id === id) ? id : m.activeConn });

const added: Edit = (m) => {
  const fresh = { ...defaultImageConnection(m.config.baseUrl), id: newConnectionId() };
  fresh.name = `Image ${m.connections.filter((c) => c.kind === "image").length + 1}`;
  return { list: [...m.connections, fresh], activeId: fresh.id };
};

const removed: Edit = (m) => {
  if (m.connections.length <= 1) return { list: m.connections, activeId: m.activeConn };
  const rest = m.connections.filter((c) => c.id !== m.activeConn);
  const keep = rest.length > 0 ? rest : m.connections.slice(0, 1);
  return { list: keep, activeId: keep.some((c) => c.id === m.activeConn) ? m.activeConn : keep[0].id };
};

const withMeta = (patch: { name?: string; kind?: ConnectionKind }): Edit => (m) => ({
  list: m.connections.map((c) => (c.id === m.activeConn ? { ...c, ...patch } : c)),
  activeId: m.activeConn,
});

const withImage = (patch: Partial<Connection["image"]>): Edit => (m) => ({
  list: m.connections.map((c) => (c.id === m.activeConn ? { ...c, image: sanitizeImage({ ...c.image, ...patch }) } : c)),
  activeId: m.activeConn,
});

export function useConnectionActions(ctx: SvgCtx): Slice<"switchConnection" | "addConnection" | "removeConnection" | "setConnectionMeta" | "setImage"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const edit = useCallback((fn: Edit) => {
    const m = latest.current.m;
    const next = fn(m); // ONCE: `added` mints a fresh id per call
    latest.current.dispatch({ type: "connections", list: next.list, activeId: next.activeId });
  }, []);
  const switchConnection = useCallback((id: string) => edit((m) => switched(m, id)), [edit]);
  const addConnection = useCallback(() => edit(added), [edit]);
  const removeConnection = useCallback(() => edit(removed), [edit]);
  const setConnectionMeta = useCallback((patch: { name?: string; kind?: ConnectionKind }) => edit(withMeta(patch)), [edit]);
  const setImage = useCallback((patch: Partial<Connection["image"]>) => edit(withImage(patch)), [edit]);
  return { switchConnection, addConnection, removeConnection, setConnectionMeta, setImage };
}
