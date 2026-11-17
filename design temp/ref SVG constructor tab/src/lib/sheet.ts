import { ICONS, type IconItem, type Profile } from "../data/icons";

export type BannerPosition = "left" | "right" | "top" | "bottom" | "none";
export type BannerStyle = "solid" | "split";
export type TextFace = "sans" | "serif" | "mono";
export type SelectionMode = "similar" | "random" | "filtered";

export type SheetConfig = {
  artboard: {
    width: number;
    height: number;
    background: string;
    padding: number;
    radius: number;
  };
  grid: {
    columns: number;
    rows: number;
    gapX: number;
    gapY: number;
    captions: boolean;
    captionColor: string;
    captionSize: number;
    captionCase: "upper" | "normal";
  };
  icons: {
    box: number;
    strokeWidth: number;
    color: string;
    linecap: "round" | "square";
  };
  banner: {
    position: BannerPosition;
    size: number;
    background: string;
    accent: string;
    textColor: string;
    subtitleColor: string;
    style: BannerStyle;
    title: string;
    subtitle: string;
    titleSize: number;
    subtitleSize: number;
    titleFace: TextFace;
    hero: boolean;
    heroIconId: string;
    divider: boolean;
  };
};

export const FONTS: Record<TextFace, { label: string; stack: string }> = {
  sans: { label: "Grotesk", stack: "'DM Sans', Arial, sans-serif" },
  serif: { label: "Editorial", stack: "'Instrument Serif', Georgia, serif" },
  mono: { label: "Mono", stack: "'DM Mono', 'Courier New', monospace" },
};

export const DEFAULT_CONFIG: SheetConfig = {
  artboard: {
    width: 1080,
    height: 660,
    background: "#F4F0E7",
    padding: 34,
    radius: 0,
  },
  grid: {
    columns: 8,
    rows: 4,
    gapX: 22,
    gapY: 18,
    captions: true,
    captionColor: "#787A6C",
    captionSize: 9,
    captionCase: "upper",
  },
  icons: {
    box: 52,
    strokeWidth: 1.4,
    color: "#202A24",
    linecap: "round",
  },
  banner: {
    position: "left",
    size: 242,
    background: "#17271F",
    accent: "#D9F36C",
    textColor: "#FBFAF4",
    subtitleColor: "#CBD6C8",
    style: "solid",
    title: "FOOD ICONS",
    subtitle: "Editable stroke width",
    titleSize: 32,
    subtitleSize: 9,
    titleFace: "sans",
    hero: true,
    heroIconId: "chef-hat",
    divider: true,
  },
};

export const PRESETS: Array<{ id: string; label: string; hint: string; patch: Partial<SheetConfig> }> = [
  {
    id: "editorial",
    label: "Side banner",
    hint: "Editorial collection",
    patch: {
      artboard: { ...DEFAULT_CONFIG.artboard },
      grid: { ...DEFAULT_CONFIG.grid, columns: 8, rows: 4, captions: true },
      icons: { ...DEFAULT_CONFIG.icons, box: 52 },
      banner: { ...DEFAULT_CONFIG.banner, position: "left", style: "solid", hero: true },
    },
  },
  {
    id: "masthead",
    label: "Top split",
    hint: "Dense catalogue",
    patch: {
      artboard: { ...DEFAULT_CONFIG.artboard, width: 1080, height: 640, padding: 30 },
      grid: { ...DEFAULT_CONFIG.grid, columns: 10, rows: 5, gapX: 16, gapY: 12, captions: false, captionSize: 7 },
      icons: { ...DEFAULT_CONFIG.icons, box: 42, strokeWidth: 1.5 },
      banner: {
        ...DEFAULT_CONFIG.banner,
        position: "top",
        style: "split",
        size: 76,
        title: "200 ICONS",
        subtitle: "Media & web",
        hero: false,
        titleSize: 27,
        subtitleSize: 22,
      },
    },
  },
  {
    id: "plain",
    label: "Plain grid",
    hint: "Clean contact sheet",
    patch: {
      artboard: { ...DEFAULT_CONFIG.artboard, width: 1080, height: 560, background: "#FBFAF6", padding: 46 },
      grid: { ...DEFAULT_CONFIG.grid, columns: 8, rows: 3, gapX: 30, gapY: 26, captions: false },
      icons: { ...DEFAULT_CONFIG.icons, box: 58, strokeWidth: 1.8 },
      banner: { ...DEFAULT_CONFIG.banner, position: "none", title: "Food icons", subtitle: "Editable stroke width" },
    },
  },
];

export function getMatchScore(icon: IconItem, tags: string[]) {
  if (tags.length === 0) return 0;
  const shared = tags.filter((tag) => icon.tags.includes(tag)).length;
  return shared / tags.length;
}

export function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number) {
  const array = [...items];
  const random = mulberry32(seed || 1);
  for (let index = array.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [array[index], array[next]] = [array[next], array[index]];
  }
  return array;
}

export function chooseIcons(options: {
  mode: SelectionMode;
  profile: Profile;
  threshold: number;
  category: string;
  count: number;
  seed: number;
  lockedIds: string[];
}) {
  const { mode, profile, threshold, category, count, seed, lockedIds } = options;
  let pool: IconItem[] = [...ICONS];

  if (mode === "similar") {
    pool = ICONS.filter((icon) => getMatchScore(icon, profile.tags) * 100 >= threshold);
  } else if (mode === "filtered") {
    pool = ICONS.filter((icon) => category === "All" || icon.category === category);
  }

  const poolWithMatches = pool.length > 0 ? pool : ICONS;
  const locked = lockedIds
    .map((id) => ICONS.find((icon) => icon.id === id))
    .filter((icon): icon is IconItem => Boolean(icon));

  if (locked.length >= count) return locked.slice(0, count);

  const lockedSet = new Set(locked.map((icon) => icon.id));
  const available = poolWithMatches.filter((icon) => !lockedSet.has(icon.id));
  let picks = shuffled(available, seed);

  if (picks.length < count - locked.length) {
    const fallback = shuffled(
      ICONS.filter((icon) => !lockedSet.has(icon.id) && !picks.some((pick) => pick.id === icon.id)),
      seed + 99,
    );
    picks = [...picks, ...fallback];
  }

  return [...locked, ...picks.slice(0, count - locked.length)];
}

export function describeMode(mode: SelectionMode, profile: Profile, category: string, threshold: number) {
  if (mode === "random") return "Random from the full library";
  if (mode === "filtered") return category === "All" ? "Random from every category" : `Random from ${category.toLowerCase()}`;
  return `${threshold}% tag match · ${profile.label}`;
}

export function relativeLuminance(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0.5;
  const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function readableInk(hex: string) {
  return relativeLuminance(hex) > 0.46 ? "#1B211D" : "#FFFFFF";
}
