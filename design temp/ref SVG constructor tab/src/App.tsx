import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { IconSheet } from "./components/IconSheet";
import { LibraryPanel } from "./components/LibraryPanel";
import { ControlsPanel } from "./components/ControlsPanel";
import { PromptBrief } from "./components/PromptBrief";
import { ICONS, ICON_BY_ID, PROFILES, type IconItem, type Profile } from "./data/icons";
import {
  DEFAULT_CONFIG,
  PRESETS,
  chooseIcons,
  getMatchScore,
  type SelectionMode,
  type SheetConfig,
} from "./lib/sheet";
import { computeLayout } from "./lib/layout";
import { copySvg, downloadPng, downloadPreset, downloadSvg } from "./lib/exporter";
import { cn } from "./utils/cn";

const INITIAL_SEED = 2841;

const initialSelection = chooseIcons({
  mode: "similar",
  profile: PROFILES[0],
  threshold: 70,
  category: "All",
  count: DEFAULT_CONFIG.grid.columns * DEFAULT_CONFIG.grid.rows,
  seed: INITIAL_SEED,
  lockedIds: [],
}).map((icon) => icon.id);

function BrandMark() {
  return (
    <span className="relative flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-[8px] bg-[#223329] shadow-[0_2px_4px_rgba(28,36,24,0.22)]">
      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="#D9F36C" strokeWidth="1.4" strokeLinecap="round">
        <rect x="3.2" y="3.2" width="7" height="7" rx="1.4" />
        <rect x="13.8" y="3.2" width="7" height="7" rx="3.5" />
        <rect x="3.2" y="13.8" width="7" height="7" rx="3.5" />
        <path d="M14 17.2h6.6M17.3 13.9v6.6" />
      </svg>
      <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-[#223329] bg-[#D9F36C]" />
    </span>
  );
}

function PresetGlyph({ id }: { id: string }) {
  if (id === "editorial") {
    return (
      <svg viewBox="0 0 18 13" className="h-[10px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="1" y="1" width="16" height="11" rx="1.2" />
        <path d="M6.3 1v11" />
        <path d="M2.8 4.2h1.4M2.8 6.3h1.4M8.5 3.5h6M8.5 6h6M8.5 8.5h6M8.5 11h6" opacity=".55" />
      </svg>
    );
  }
  if (id === "masthead") {
    return (
      <svg viewBox="0 0 18 13" className="h-[10px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="1" y="1" width="16" height="11" rx="1.2" />
        <path d="M1 4.4h16" />
        <path d="M2.8 7.2h2M6.2 7.2h2M9.6 7.2h2M13 7.2h2M2.8 9.4h2M6.2 9.4h2M9.6 9.4h2M13 9.4h2M2.8 11.3h2M6.2 11.3h2M9.6 11.3h2" opacity=".55" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 13" className="h-[10px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="1" y="1" width="16" height="11" rx="1.2" />
      <path d="M4 4h1.5M8.2 4h1.5M12.4 4h1.5M4 7h1.5M8.2 7h1.5M12.4 7h1.5M4 10h1.5M8.2 10h1.5M12.4 10h1.5" opacity=".6" />
    </svg>
  );
}

type Toast = { id: number; message: string };

export default function App() {
  const [config, setConfig] = useState<SheetConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<SheetConfig[]>([]);
  const [future, setFuture] = useState<SheetConfig[]>([]);
  const [activePreset, setActivePreset] = useState("editorial");
  const [mode, setMode] = useState<SelectionMode>("similar");
  const [profile, setProfile] = useState<Profile>(PROFILES[0]);
  const [threshold, setThreshold] = useState(70);
  const [category, setCategory] = useState("All");
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [fitScale, setFitScale] = useState(0.64);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const artboardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previousCapacity = useRef(config.grid.columns * config.grid.rows);

  const capacity = config.grid.columns * config.grid.rows;
  const scale = zoom === "fit" ? fitScale : zoom;
  const layout = useMemo(() => computeLayout(config), [config]);
  const selectedIcons = useMemo(
    () => selectedIds.map((id) => ICON_BY_ID.get(id)).filter((icon): icon is IconItem => Boolean(icon)),
    [selectedIds],
  );

  const notify = (message: string) => setToast({ id: Date.now(), message });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth - 54;
      const height = element.clientHeight - 68;
      const next = Math.min(width / config.artboard.width, height / config.artboard.height, 1.15);
      setFitScale(Math.max(0.16, Number(next.toFixed(3))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [config.artboard.width, config.artboard.height]);

  useEffect(() => {
    if (previousCapacity.current === capacity) return;
    previousCapacity.current = capacity;
    setSelectedIds((current) => {
      if (current.length >= capacity) return current.slice(0, capacity);
      const extras = chooseIcons({
        mode,
        profile,
        threshold,
        category,
        count: capacity,
        seed: seed + capacity,
        lockedIds: [],
      })
        .filter((icon) => !current.includes(icon.id))
        .map((icon) => icon.id);
      return [...current, ...extras].slice(0, capacity);
    });
  }, [capacity, mode, profile, threshold, category, seed]);

  const applyConfig = (next: SheetConfig, presetId = "custom") => {
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    setHistory((entries) => [...entries.slice(-39), config]);
    setFuture([]);
    setConfig(next);
    setActivePreset(presetId);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((entries) => entries.slice(0, -1));
    setFuture((entries) => [config, ...entries].slice(0, 40));
    setConfig(previous);
    setActivePreset("custom");
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((entries) => entries.slice(1));
    setHistory((entries) => [...entries.slice(-39), config]);
    setConfig(next);
    setActivePreset("custom");
  };

  const notifyPoolShortage = (recipeMode: SelectionMode, matchThreshold: number) => {
    let poolCount = ICONS.length;
    if (recipeMode === "similar") {
      poolCount = ICONS.filter((icon) => getMatchScore(icon, profile.tags) * 100 >= matchThreshold).length;
    } else if (recipeMode === "filtered" && category !== "All") {
      poolCount = ICONS.filter((icon) => icon.category === category).length;
    }
    if (poolCount < capacity) {
      const message =
        recipeMode === "similar"
          ? `Only ${poolCount} icons meet ≥${matchThreshold}% metadata match. Closest matches fill the remaining cells.`
          : `That filter has ${poolCount} icons for ${capacity} cells. The closest library pick fills the rest.`;
      notify(message);
    }
  };

  const runSelection = (
    recipe: { mode: SelectionMode; profile: Profile; threshold: number; category: string },
    nextSeed = seed + 1,
  ) => {
    const picks = chooseIcons({
      ...recipe,
      count: capacity,
      seed: nextSeed,
      lockedIds,
    }).map((icon) => icon.id);
    const next = Array.from({ length: capacity }, (_, index) =>
      lockedIds.includes(selectedIds[index] ?? "") ? selectedIds[index] : null,
    );
    const remaining = picks.filter((id) => !next.includes(id));
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] === null) next[index] = remaining.shift() ?? null;
    }
    setSelectedIds(next.filter((id): id is string => Boolean(id)));
    setSeed(nextSeed);
  };

  const handleShuffle = () => {
    runSelection({ mode, profile, threshold, category });
    notifyPoolShortage(mode, threshold);
  };

  const handleModeChange = (nextMode: SelectionMode) => {
    setMode(nextMode);
    runSelection({ mode: nextMode, profile, threshold, category });
    notifyPoolShortage(nextMode, threshold);
  };

  const handleProfileChange = (nextProfile: Profile) => {
    setProfile(nextProfile);
    runSelection({ mode, profile: nextProfile, threshold, category });
    notifyPoolShortage(mode, threshold);
  };

  const handleThresholdChange = (nextThreshold: number) => {
    setThreshold(nextThreshold);
    runSelection({ mode, profile, threshold: nextThreshold, category });
  };

  const handleCategoryChange = (nextCategory: string) => {
    setCategory(nextCategory);
    if (mode === "filtered") {
      runSelection({ mode, profile, threshold, category: nextCategory });
      const poolCount = nextCategory === "All" ? ICONS.length : ICONS.filter((icon) => icon.category === nextCategory).length;
      if (poolCount < capacity) notify(`Only ${poolCount} icons in ${nextCategory.toLowerCase()} — closest matches fill the remaining cells.`);
    }
  };

  const handleToggleIcon = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((current) => current.filter((item) => item !== id));
      setLockedIds((current) => current.filter((item) => item !== id));
      return;
    }
    if (selectedIds.length >= capacity) {
      notify("Every cell is filled. Deselect an icon first, or add a row to the grid.");
      return;
    }
    setSelectedIds((current) => [...current, id]);
  };

  const handleToggleLock = (id: string) => {
    setLockedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handlePreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    applyConfig(
      {
        ...config,
        ...preset.patch,
        artboard: { ...config.artboard, ...preset.patch.artboard },
        grid: { ...config.grid, ...preset.patch.grid },
        icons: { ...config.icons, ...preset.patch.icons },
        banner: { ...config.banner, ...preset.patch.banner },
      } as SheetConfig,
      presetId,
    );
  };

  const reset = () => {
    applyConfig(DEFAULT_CONFIG, "editorial");
    setZoom("fit");
    notify("Sheet settings reset");
  };

  const changeZoom = (direction: 1 | -1) => {
    const current = zoom === "fit" ? fitScale : zoom;
    const next = Math.min(2, Math.max(0.1, Number((current + direction * 0.1).toFixed(2))));
    setZoom(next);
  };

  const handleExport = async (kind: "svg" | "png" | "copy" | "json") => {
    if (!artboardRef.current) return;
    setExporting(kind);
    try {
      if (kind === "svg") {
        downloadSvg(artboardRef.current, config);
        notify("Editable SVG exported — strokes and text preserved.");
      } else if (kind === "png") {
        await downloadPng(artboardRef.current, config, 2);
        notify("PNG exported at 2× resolution.");
      } else if (kind === "copy") {
        await copySvg(artboardRef.current, config);
        notify("SVG markup copied to clipboard.");
      } else {
        downloadPreset(config, selectedIds, seed);
        notify("Preset saved with layout settings and seed.");
      }
      setExportOpen(false);
    } catch {
      notify("Export could not be completed. Try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex h-screen min-h-[600px] w-full flex-col overflow-hidden bg-[#EDEAE1] text-[#252C25]">
      <header className="relative z-30 flex h-[58px] w-full shrink-0 items-center border-b border-[#E1DDD0] bg-[#FBFAF6]">
        <div className="flex h-full w-[272px] shrink-0 items-center gap-2.5 border-r border-[#E4E0D4] px-4">
          <BrandMark />
          <div className="flex flex-col">
            <span className="font-['Instrument_Serif'] text-[22px] leading-[0.86] tracking-[-0.02em] text-[#233027]">
              glyph<span className="text-[#8EA252]">.</span>
            </span>
            <span className="mt-[3px] font-mono text-[6.7px] uppercase tracking-[0.23em] text-[#9B9D8E]">
              sheet constructor
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[7.8px] uppercase tracking-[0.15em] text-[#A0A293]">
                  Collection / 01
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-[#BFC3A7]" />
                <span className="flex items-center gap-1 font-mono text-[7.8px] uppercase tracking-[0.1em] text-[#9AA75E]">
                  <span className="h-[3px] w-[3px] rounded-full bg-[#99AA56]" />
                  live
                </span>
              </div>
              <span className="max-w-[330px] truncate text-[12px] font-semibold leading-tight tracking-[-0.015em] text-[#293129]">
                {config.banner.title || "Untitled icon sheet"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="mr-1 hidden items-center rounded-lg border border-[#E5E1D5] bg-[#F7F4EC] sm:flex">
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                aria-label="Undo"
                className="flex h-7 w-7 items-center justify-center rounded-l-lg text-[#767A6B] transition-colors hover:bg-white hover:text-[#293129] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 size={12} />
              </button>
              <span className="h-3 w-px bg-[#E0DCCF]" />
              <button
                type="button"
                onClick={redo}
                disabled={future.length === 0}
                aria-label="Redo"
                className="flex h-7 w-7 items-center justify-center rounded-r-lg text-[#767A6B] transition-colors hover:bg-white hover:text-[#293129] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Redo2 size={12} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleShuffle}
              title="Re-roll this seed"
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-[#E3DFD3] bg-white px-2.5 transition-colors hover:border-[#BEC6A0] xl:flex"
            >
              <RotateCw size={9.5} className="text-[#8D9670]" strokeWidth={2} />
              <span className="font-mono text-[7.5px] uppercase tracking-[0.11em] text-[#9A9C8E]">seed</span>
              <span className="font-mono text-[9.5px] font-medium text-[#4D5747]">{seed}</span>
            </button>

            <button
              type="button"
              onClick={() => setBriefOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#DEDACE] bg-transparent px-2.5 text-[10px] font-medium text-[#5B6355] transition-colors hover:border-[#BEC6A0] hover:bg-[#F7F4EC] hover:text-[#293129]"
            >
              <FileText size={11} strokeWidth={1.7} />
              <span className="hidden md:inline">Prompt brief</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((value) => !value)}
                className="flex h-8 items-center gap-2 rounded-lg bg-[#24362A] pl-3 pr-2.5 text-[10px] font-semibold text-[#F7F3E7] shadow-[0_2px_5px_rgba(28,40,30,0.18)] transition-colors hover:bg-[#19271E]"
              >
                <Download size={11.5} strokeWidth={2} />
                Export
                <ChevronDown
                  size={10}
                  className={cn("text-[#B8C7A8] transition-transform duration-200", exportOpen && "rotate-180")}
                />
              </button>
              {exportOpen ? (
                <>
                  <button
                    aria-label="Close export menu"
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setExportOpen(false)}
                  />
                  <div className="absolute right-0 top-[38px] z-30 w-[234px] overflow-hidden rounded-xl border border-[#DEDACE] bg-[#FCFBF7] p-1 shadow-[0_16px_40px_rgba(24,33,21,0.18)]">
                    <div className="px-2.5 pb-1.5 pt-2">
                      <span className="font-mono text-[7.5px] uppercase tracking-[0.16em] text-[#A2A495]">Export sheet</span>
                    </div>
                    {[
                      {
                        kind: "svg" as const,
                        icon: FileText,
                        label: "Editable SVG",
                        hint: "Paths, strokes and text",
                      },
                      {
                        kind: "png" as const,
                        icon: ImageIcon,
                        label: "PNG — 2×",
                        hint: `${config.artboard.width * 2} × ${config.artboard.height * 2}px`,
                      },
                      {
                        kind: "copy" as const,
                        icon: Copy,
                        label: "Copy SVG markup",
                        hint: "Paste into your design tool",
                      },
                      {
                        kind: "json" as const,
                        icon: FileJson,
                        label: "Save preset",
                        hint: "Settings, selection and seed",
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.kind}
                          type="button"
                          onClick={() => handleExport(item.kind)}
                          disabled={exporting !== null}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#F2EFE5] disabled:opacity-50"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E6E2D6] bg-white text-[#67774B]">
                            <Icon size={12} strokeWidth={1.7} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium text-[#374034]">
                              {exporting === item.kind ? "Preparing…" : item.label}
                            </span>
                            <span className="block truncate text-[8.5px] text-[#9A9C8E]">{item.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                    <div className="mx-2 mt-1 flex items-center gap-1.5 border-t border-[#ECE8DD] py-2">
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#EAF0D7] text-[#6D803E]">
                        <Check size={8} strokeWidth={2.7} />
                      </span>
                      <span className="text-[8.5px] text-[#909486]">Stroke-safe and seed reproducible</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LibraryPanel
          icons={ICONS}
          selectedIds={selectedIds}
          lockedCount={lockedIds.length}
          capacity={capacity}
          mode={mode}
          profile={profile}
          threshold={threshold}
          category={category}
          onModeChange={handleModeChange}
          onProfileChange={handleProfileChange}
          onThresholdChange={handleThresholdChange}
          onCategoryChange={handleCategoryChange}
          onToggleIcon={handleToggleIcon}
          onShuffle={handleShuffle}
          onClear={() => {
            setSelectedIds([]);
            setLockedIds([]);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#EAE7DF]">
          <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-b border-[#DDD9CC] bg-[#F8F6F0] px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="mr-0.5 hidden font-mono text-[7.5px] uppercase tracking-[0.13em] text-[#A3A596] lg:inline">
                Layout
              </span>
              <div className="flex items-center gap-1">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePreset(preset.id)}
                    title={preset.hint}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[9px] font-medium transition-all",
                      activePreset === preset.id
                        ? "border-[#D8D4C6] bg-white text-[#2C362D] shadow-[0_1px_2px_rgba(30,35,25,0.09)]"
                        : "border-transparent text-[#8A8D7F] hover:bg-white/65 hover:text-[#465043]",
                    )}
                  >
                    <PresetGlyph id={preset.id} />
                    <span className="hidden xl:inline">{preset.label}</span>
                  </button>
                ))}
              </div>
              {activePreset === "custom" ? (
                <span className="rounded-full bg-[#EAE6DA] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wider text-[#878A7B]">
                  custom
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <div className="flex h-7 items-center rounded-md border border-[#E1DDD1] bg-white">
                <button
                  type="button"
                  onClick={() => changeZoom(-1)}
                  aria-label="Zoom out"
                  className="flex h-full w-6 items-center justify-center rounded-l-md text-[#777C6D] hover:bg-[#F2EFE6]"
                >
                  <Minus size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom("fit")}
                  title="Zoom to fit"
                  className="h-full min-w-[43px] border-x border-[#ECE8DD] px-1 font-mono text-[9px] text-[#50594A] hover:bg-[#F2EFE6]"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => changeZoom(1)}
                  aria-label="Zoom in"
                  className="flex h-full w-6 items-center justify-center rounded-r-md text-[#777C6D] hover:bg-[#F2EFE6]"
                >
                  <Plus size={10} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setZoom("fit")}
                title="Fit to screen"
                className={cn(
                  "ml-0.5 flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                  zoom === "fit"
                    ? "border-[#D5D1C3] bg-white text-[#3F4A3C]"
                    : "border-transparent text-[#8C8F80] hover:border-[#DDD9CC] hover:bg-white/70",
                )}
              >
                <Maximize2 size={11} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Actual size (100%)"
                className={cn(
                  "flex h-7 min-w-[28px] items-center justify-center rounded-md border px-1 font-mono text-[8.5px] transition-colors",
                  zoom === 1
                    ? "border-[#D5D1C3] bg-white text-[#3F4A3C]"
                    : "border-transparent text-[#8C8F80] hover:border-[#DDD9CC] hover:bg-white/70",
                )}
              >
                1:1
              </button>
            </div>
          </div>

          <div ref={stageRef} className="stage-dots relative min-h-0 flex-1 overflow-auto">
            <div className="flex min-h-full min-w-full items-center justify-center p-7">
              <div
                className="group/sheet relative shrink-0"
                style={{ width: config.artboard.width * scale, height: config.artboard.height * scale }}
              >
                <div
                  className="relative origin-top-left overflow-hidden shadow-[0_22px_55px_rgba(38,45,31,0.19),0_2px_7px_rgba(38,45,31,0.08)] ring-1 ring-black/[0.06]"
                  style={{ width: config.artboard.width, height: config.artboard.height, transform: `scale(${scale})` }}
                >
                  <IconSheet
                    ref={artboardRef}
                    config={config}
                    icons={selectedIcons}
                    lockedIds={lockedIds}
                    onToggleLock={handleToggleLock}
                    interactive
                  />
                </div>
                <div className="pointer-events-none absolute -bottom-5 left-0 flex items-center gap-2 opacity-0 transition-opacity group-hover/sheet:opacity-100">
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#919486]">
                    artboard 01 · {config.artboard.width} × {config.artboard.height}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleShuffle}
              className="absolute right-4 top-4 flex h-8 items-center gap-1.5 rounded-lg border border-[#DDD9CC] bg-[#FBFAF6]/90 px-2.5 text-[9px] font-medium text-[#6E7567] shadow-sm backdrop-blur transition-all hover:border-[#AEB98C] hover:text-[#354032] active:scale-[0.98]"
            >
              <RotateCw size={10.5} strokeWidth={1.9} />
              Reshuffle
            </button>
          </div>

          <div className="flex h-[38px] shrink-0 items-center justify-between gap-3 border-t border-[#DEDACE] bg-[#F8F6F0] px-4">
            <div className="flex min-w-0 items-center gap-2">
              {layout.overflow ? (
                <>
                  <AlertTriangle size={10} className="shrink-0 text-[#B98538]" />
                  <span className="truncate text-[8.5px] text-[#A0783D]">
                    Grid auto-fitted to {Math.round(layout.fitScale * 100)}% to remain inside the artboard
                  </span>
                </>
              ) : selectedIds.length < capacity ? (
                <>
                  <AlertTriangle size={10} className="shrink-0 text-[#B98538]" />
                  <span className="truncate text-[8.5px] text-[#A0783D]">
                    {capacity - selectedIds.length} empty {capacity - selectedIds.length === 1 ? "cell" : "cells"} · reshuffle to fill
                  </span>
                </>
              ) : (
                <>
                  <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-[#E4EDCE]">
                    <Check size={8} strokeWidth={2.8} className="text-[#6F843F]" />
                  </span>
                  <span className="truncate text-[8.5px] text-[#7F8875]">
                    <strong className="font-semibold text-[#596453]">{selectedIcons.length}</strong> glyphs placed · every
                    stroke inside its box
                  </span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden items-center gap-1.5 font-mono text-[7.5px] uppercase tracking-[0.1em] text-[#A2A495] md:flex">
                <Sparkles size={9} className="text-[#97A36C]" />
                live vector preview
              </span>
              <span className="font-mono text-[8px] text-[#848878]">
                {config.artboard.width} × {config.artboard.height} px
              </span>
            </div>
          </div>
        </main>

        <ControlsPanel config={config} onChange={(next) => applyConfig(next)} onReset={reset} />
      </div>

      <PromptBrief open={briefOpen} onClose={() => setBriefOpen(false)} onNotify={notify} />

      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 animate-toast">
          <div className="flex max-w-[560px] items-center gap-2.5 rounded-xl border border-white/10 bg-[#223027] px-3.5 py-2.5 shadow-[0_12px_35px_rgba(20,30,22,0.3)]">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#D9F36C] text-[#2A3B24]">
              <Check size={9.5} strokeWidth={2.7} />
            </span>
            <p className="text-[10px] font-medium leading-snug text-[#F1F3E7]">{toast.message}</p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setBriefOpen(true)}
        className="fixed bottom-12 right-[332px] z-20 hidden h-7 items-center gap-1.5 rounded-lg border border-[#D8D4C6] bg-white/90 px-2.5 text-[8.5px] font-medium text-[#7E846F] shadow-sm backdrop-blur transition-all hover:border-[#ACBB85] hover:text-[#394436] 2xl:flex"
      >
        <Wand2 size={10} />
        Corrected brief
      </button>
    </div>
  );
}
