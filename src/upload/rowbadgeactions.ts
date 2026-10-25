// rowbadgeactions.ts — catalog CRUD and apply/toggle for upload row badges (I-79).
import { useCallback, useRef } from "react";
import {
  addBadge, applyBadgeToIds, removeBadge, renameBadge, recolorBadge, statesEqual,
  toggleBadgeOn, type RowBadgeState,
} from "../lib/upload/rowbadge";
import { getAppState } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { getRowBadgeState, setRowBadgeState } from "./rowbadgestore";
import type { UploadActions, UploadCtx } from "./actions";

export type RowBadgeActions = Pick<UploadActions,
  "openRowBadges" | "addRowBadge" | "removeRowBadge" | "renameRowBadge" | "recolorRowBadge" | "toggleRowBadge" | "applyRowBadgeSelected"
>;

type Latest = { current: UploadCtx };

export function useRowBadgeActions(ctx: UploadCtx): RowBadgeActions {
  const latest = useRef(ctx);
  latest.current = ctx;
  return {
    openRowBadges: useOpen(latest),
    addRowBadge: useAdd(latest),
    removeRowBadge: useRemove(latest),
    renameRowBadge: useRename(latest),
    recolorRowBadge: useRecolor(latest),
    toggleRowBadge: useToggle(latest),
    applyRowBadgeSelected: useApply(latest),
  };
}

function useOpen(latest: Latest) {
  return useCallback(() => latest.current.dispatch({ type: "dialog", dialog: { kind: "rowBadges" } }), [latest]);
}

function useAdd(latest: Latest) {
  return useCallback((name: string, color?: string) => {
    const before = getRowBadgeState();
    commit({ ctx: latest.current, before, after: addBadge(before, name, color), label: "Add badge" });
  }, [latest]);
}

function useRemove(latest: Latest) {
  return useCallback((id: string) => {
    const ctx = latest.current;
    const before = getRowBadgeState();
    commit({ ctx, before, after: removeBadge(before, id), label: "Remove badge", ids: [id] });
    if (ctx.m.filter.badge === id) ctx.dispatch({ type: "filter", patch: { badge: "all" } });
  }, [latest]);
}

function useRename(latest: Latest) {
  return useCallback((id: string, name: string) => {
    const before = getRowBadgeState();
    commit({ ctx: latest.current, before, after: renameBadge(before, id, name), label: "Rename badge", ids: [id], gesture: true });
  }, [latest]);
}

function useRecolor(latest: Latest) {
  return useCallback((id: string, color: string) => {
    const before = getRowBadgeState();
    commit({ ctx: latest.current, before, after: recolorBadge(before, id, color), label: "Recolour badge", ids: [id], gesture: true });
  }, [latest]);
}

function useToggle(latest: Latest) {
  return useCallback((pairId: string, badgeId: string) => {
    const before = getRowBadgeState();
    commit({ ctx: latest.current, before, after: toggleBadgeOn(before, pairId, badgeId), label: "Toggle badge", ids: [pairId] });
  }, [latest]);
}

function useApply(latest: Latest) {
  return useCallback((ids: string[], badgeId: string) => {
    const before = getRowBadgeState();
    commit({ ctx: latest.current, before, after: applyBadgeToIds(before, ids, badgeId), label: "Apply badge to selected", ids });
  }, [latest]);
}

interface CommitArgs {
  ctx: UploadCtx;
  before: RowBadgeState;
  after: RowBadgeState | null;
  label: string;
  ids?: string[];
  gesture?: boolean;
}

function commit(a: CommitArgs): void {
  if (a.after === null || statesEqual(a.before, a.after)) return;
  setRowBadgeState(a.after);
  pushHistory(a.ctx.hist, a, a.after);
  a.ctx.say(a.label);
}

function pushHistory(hist: HistoryApi, a: CommitArgs, after: RowBadgeState): void {
  const entry = { type: "uploadRowBadges", label: a.label, origin: getAppState().tab, ids: a.ids ?? [], before: a.before, after };
  if (a.gesture) hist.pushGesture(entry);
  else hist.push(entry);
}
