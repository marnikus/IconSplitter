// ui/hotkeys.ts — keyboard navigation and row actions for the SVG source list.

import { useEffect, useRef } from "react";
import type { SvgLoadedVersion, SvgReviewDecision, SvgSourceRow } from "../types";
import { isTextField } from "../../selection/hotkeys";

interface SelectionHotkeys {
  toggleCheck: (id: string) => void;
  core: { select: (id: string) => void };
}

interface SvgHotkeyContext {
  enabled: boolean;
  rows: SvgSourceRow[];
  activeId: string | null;
  selection: SelectionHotkeys;
  generate: (rows: SvgSourceRow[]) => void;
  review: (rows: SvgSourceRow[], decision: SvgReviewDecision) => void;
  code: (row: SvgSourceRow, version: SvgLoadedVersion) => void;
}

type SvgCodeAction = SvgHotkeyContext["code"];

export function useSvgHotkeys(context: SvgHotkeyContext): void {
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => {
    if (!context.enabled) return;
    const onKey = (event: KeyboardEvent) => handleSvgHotkey(event, latest.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [context.enabled]);
}

export function showNewestCode(row: SvgSourceRow, code: SvgCodeAction): void {
  const version = row.versions.find((item) => item.version === row.newestVersion);
  if (version) code(row, version);
}

function handleSvgHotkey(event: KeyboardEvent, context: SvgHotkeyContext): void {
  if (shouldIgnoreHotkey(event, context.enabled)) return;
  const row = context.rows.find((item) => item.pairId === context.activeId) ?? context.rows[0];
  if (!row) return;
  if (event.key === " ") return toggleActive(event, row, context.selection);
  if (isArrow(event.key)) return moveActive(event, context.rows, row, context.selection.core.select);
  runRowShortcut(event, row, context);
}

function shouldIgnoreHotkey(event: KeyboardEvent, enabled: boolean): boolean {
  return !enabled || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)
    || buttonTarget(event.target) || dialogOpen();
}

function buttonTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

function toggleActive(event: KeyboardEvent, row: SvgSourceRow, selection: SelectionHotkeys): void {
  event.preventDefault(); selection.toggleCheck(row.pairId);
}

function isArrow(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp";
}

function moveActive(event: KeyboardEvent, rows: SvgSourceRow[], active: SvgSourceRow, select: (id: string) => void): void {
  event.preventDefault();
  const index = rows.findIndex((row) => row.pairId === active.pairId);
  const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  select(next.pairId);
  focusActiveRow(next.pairId);
}

function focusActiveRow(pairId: string): void {
  const testId = `svg-row-${pairId}`;
  const row = [...document.querySelectorAll<HTMLElement>("[data-testid^='svg-row-']")]
    .find((element) => element.dataset.testid === testId);
  row?.focus(); row?.scrollIntoView({ block: "nearest" });
}

function runRowShortcut(event: KeyboardEvent, row: SvgSourceRow, context: SvgHotkeyContext): void {
  const key = event.key.toLowerCase();
  if (key === "g" && canGenerate(row)) { event.preventDefault(); context.generate([row]); }
  if (key === "a" && row.newestSvg) { event.preventDefault(); context.review([row], "approved"); }
  if (key === "d" && row.newestSvg) { event.preventDefault(); context.review([row], "declined"); }
  if (key === "v") showNewestCode(row, context.code);
}

function canGenerate(row: SvgSourceRow): boolean {
  const hasOrphanOutput = row.versions.length > 0 || Boolean(row.recoverableTempPath);
  return !row.recoverableTempPath && !["unknown", "corrupt", "generating"].includes(row.generation)
    && (row.sidecarState === "ok" || !hasOrphanOutput);
}
