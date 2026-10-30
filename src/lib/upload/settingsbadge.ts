// Badge settings shape and validation; placement/source geometry have separate owners.
import type { BadgeCorner } from "./cornerbadge";
import { readBadgeTemplate } from "./badgetemplate";
import { BADGE_OFFSET_DEFAULT, BADGE_WIDTH_DEFAULT, clampBadgeOffsetPct, clampBadgeWidthPct } from "./settingsnumbers";

export interface BadgeSettings {
  /** Opt-in per icon, never enabled by persisted defaults. */
  badgeEnabled: boolean;
  /** Empty selects the bundled graphic; otherwise validated vector SVG. */
  badgeTemplateSvg: string;
  badgeCorner: BadgeCorner;
  /** Percentage of final artboard width. Insets reference the selected edges. */
  badgeWidthPct: number;
  badgeOffsetXPct: number;
  badgeOffsetYPct: number;
}

export const BADGE_CORNERS: readonly BadgeCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
export const BADGE_CORNER_DEFAULT: BadgeCorner = "bottom-right";
export const BADGE_DEFAULTS: BadgeSettings = {
  badgeEnabled: false, badgeTemplateSvg: "", badgeCorner: BADGE_CORNER_DEFAULT,
  badgeWidthPct: BADGE_WIDTH_DEFAULT, badgeOffsetXPct: BADGE_OFFSET_DEFAULT, badgeOffsetYPct: BADGE_OFFSET_DEFAULT,
};

export function parseBadgeCorner(value: unknown): BadgeCorner | null {
  return typeof value === "string" && BADGE_CORNERS.includes(value as BadgeCorner) ? value as BadgeCorner : null;
}

export function normalizeBadge(raw: Record<string, unknown>): BadgeSettings {
  return {
    badgeEnabled: false,
    badgeTemplateSvg: readBadgeTemplate(raw.badgeTemplateSvg) ?? "",
    badgeCorner: parseBadgeCorner(raw.badgeCorner) ?? BADGE_CORNER_DEFAULT,
    badgeWidthPct: clampBadgeWidthPct(raw.badgeWidthPct),
    badgeOffsetXPct: clampBadgeOffsetPct(raw.badgeOffsetXPct),
    badgeOffsetYPct: clampBadgeOffsetPct(raw.badgeOffsetYPct),
  };
}

/** Template/default choice and corner pins; shared flag/number readers own the other fields. */
export function readBadgeOverrides(raw: Record<string, unknown>): Partial<BadgeSettings> {
  const out: Partial<BadgeSettings> = {};
  const template = readBadgeTemplate(raw.badgeTemplateSvg);
  if (template !== null) out.badgeTemplateSvg = template;
  const corner = parseBadgeCorner(raw.badgeCorner);
  if (corner !== null) out.badgeCorner = corner;
  return out;
}
