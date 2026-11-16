import { useMemo, useState } from "react";
import { Filter, RotateCw, Search, Shuffle, Sparkles, X } from "lucide-react";
import { LIBRARY_CATEGORIES, PROFILES, type IconItem } from "../data/icons";
import type { Profile } from "../data/icons";
import { describeMode, getMatchScore, type SelectionMode } from "../lib/sheet";
import { cn } from "../utils/cn";

const SHORT_CATEGORY: Record<string, string> = {
  All: "All",
  Food: "Food",
  Drinks: "Drinks",
  Kitchen: "Kitchen",
  Commerce: "Shop",
  Interface: "UI",
};

type LibraryPanelProps = {
  icons: IconItem[];
  selectedIds: string[];
  lockedCount: number;
  capacity: number;
  mode: SelectionMode;
  profile: Profile;
  threshold: number;
  category: string;
  onModeChange: (mode: SelectionMode) => void;
  onProfileChange: (profile: Profile) => void;
  onThresholdChange: (threshold: number) => void;
  onCategoryChange: (category: string) => void;
  onToggleIcon: (id: string) => void;
  onShuffle: () => void;
  onClear: () => void;
};

export function LibraryPanel({
  icons,
  selectedIds,
  lockedCount,
  capacity,
  mode,
  profile,
  threshold,
  category,
  onModeChange,
  onProfileChange,
  onThresholdChange,
  onCategoryChange,
  onToggleIcon,
  onShuffle,
  onClear,
}: LibraryPanelProps) {
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return icons.filter((icon) => {
      const inCategory = category === "All" || icon.category === category;
      const inSearch =
        !query ||
        icon.name.toLowerCase().includes(query) ||
        icon.category.toLowerCase().includes(query) ||
        icon.tags.some((tag) => tag.includes(query));
      return inCategory && inSearch;
    });
  }, [icons, category, search]);

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-[#E3DFD3] bg-[#FBFAF6]">
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#E7E3D8] px-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-[-0.015em] text-[#252B25]">Icon library</span>
          <span className="rounded-full bg-[#E9EFD3] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#516329]">
            {icons.length}
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#A0A192]">stroke only</span>
      </div>

      <div className="shrink-0 p-3.5 pb-3">
        <div className="rounded-xl border border-[#E2DED1] bg-[#F7F4EC] p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6E7265]">Selection recipe</span>
            <Sparkles size={11} className="text-[#7B8A42]" strokeWidth={1.8} />
          </div>
          <div className="mb-3 flex rounded-lg border border-[#E1DDD0] bg-[#EDE9DD] p-0.5">
            {[
              { value: "similar" as const, label: "Similar", icon: <Sparkles size={10} /> },
              { value: "random" as const, label: "Random", icon: <Shuffle size={10} /> },
              { value: "filtered" as const, label: "Filtered", icon: <Filter size={10} /> },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[9.5px] font-medium transition-all",
                  mode === option.value
                    ? "bg-white text-[#2A322B] shadow-[0_1px_2px_rgba(30,35,25,0.12)]"
                    : "text-[#8A8C7D] hover:text-[#454D41]",
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>

          {mode === "random" ? (
            <div className="rounded-lg border border-[#E4E0D4] bg-white/65 px-2.5 py-2">
              <p className="text-[10px] leading-relaxed text-[#747869]">
                A seeded draw from all <strong className="font-semibold text-[#495041]">{icons.length}</strong> glyphs.
                Same seed, same sheet.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#939587]">
                  {mode === "similar" ? "Metadata profile" : "Category"}
                </span>
                {mode === "similar" ? (
                  <div className="relative">
                    <select
                      value={profile.id}
                      onChange={(event) => {
                        const next = PROFILES.find((item) => item.id === event.target.value);
                        if (next) onProfileChange(next);
                      }}
                      className="h-8 w-full appearance-none rounded-md border border-[#DDD8C9] bg-white pl-2.5 pr-7 text-[10.5px] font-medium text-[#3A4239] outline-none focus:border-[#94A266]"
                    >
                      {PROFILES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-[#8B8D7E]">
                      ▾
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {LIBRARY_CATEGORIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onCategoryChange(option)}
                        className={cn(
                          "h-6 rounded-md border px-2 text-[9px] font-medium transition-colors",
                          category === option
                            ? "border-[#2D3930] bg-[#2D3930] text-white"
                            : "border-[#DDD8C9] bg-white text-[#777A6C] hover:border-[#A7AE8C]",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              {mode === "similar" ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#939587]">Match threshold</span>
                    <span className="rounded bg-[#E7EDCD] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#596B24]">
                      ≥ {threshold}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={threshold}
                    onChange={(event) => onThresholdChange(Number(event.target.value))}
                    className="sheet-range w-full"
                    style={{
                      background: `linear-gradient(to right, #82964B 0%, #82964B ${((threshold - 30) / 70) * 100}%, #DED9CA ${((threshold - 30) / 70) * 100}%, #DED9CA 100%)`,
                    }}
                    aria-label="Metadata match threshold"
                  />
                  <p className="mt-1.5 text-[9px] leading-snug text-[#929486]">
                    {profile.tags.map((tag) => `#${tag}`).join("  ")}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-md bg-white/60 px-2 py-1.5">
                  <span className="font-mono text-[8.5px] uppercase tracking-wide text-[#939587]">Empties</span>
                  <span className="text-[9px] font-medium text-[#515A4A]">Fill from full library</span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onShuffle}
            className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#26382C] text-[10px] font-semibold text-[#F4F1E7] transition-all hover:bg-[#1B2A20] active:scale-[0.99]"
          >
            <RotateCw size={11} strokeWidth={2} />
            Reshuffle {capacity} icons
          </button>
          <p className="mt-2 truncate text-center text-[9px] text-[#989A8C]" title={describeMode(mode, profile, category, threshold)}>
            {describeMode(mode, profile, category, threshold)}
          </p>
        </div>
      </div>

      <div className="shrink-0 px-4">
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-[#E1DDD0] bg-white px-2.5 focus-within:border-[#A5AD84]">
          <Search size={12} className="shrink-0 text-[#9C9E8F]" strokeWidth={1.9} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or #tag"
            className="h-8 w-full bg-transparent text-[10.5px] text-[#373E35] outline-none placeholder:text-[#A8AA9C]"
          />
          {search ? (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={11} className="text-[#929486]" />
            </button>
          ) : null}
        </div>
        <div className="no-scrollbar mb-3 flex items-center gap-1 overflow-x-auto pb-0.5">
          {LIBRARY_CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onCategoryChange(option)}
              title={option === "Commerce" ? "Shop & delivery" : option === "Interface" ? "Interface & interface utilities" : option}
              className={cn(
                "h-[21px] shrink-0 rounded-full px-2 text-[8.5px] font-medium transition-colors",
                category === option
                  ? "bg-[#E2E9C7] text-[#4D5F24]"
                  : "bg-[#F1EEE5] text-[#838678] hover:bg-[#E9E5D9] hover:text-[#555D4C]",
              )}
            >
              {SHORT_CATEGORY[option] ?? option}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="sheet-scroll absolute inset-0 grid auto-rows-min grid-cols-6 content-start gap-1.5 overflow-y-auto px-4 pb-6">
          {filtered.map((icon) => {
            const Icon = icon.Icon;
            const selected = selectedSet.has(icon.id);
            const score = Math.round(getMatchScore(icon, profile.tags) * 100);
            return (
              <button
                key={icon.id}
                type="button"
                onClick={() => onToggleIcon(icon.id)}
                title={`${icon.name} · ${score}% tag match${selected ? " · in sheet" : ""}`}
                className={cn(
                  "group relative flex aspect-square items-center justify-center rounded-lg border transition-all duration-150",
                  selected
                    ? "border-[#C5D1A5] bg-[#E8EDD7] text-[#39482F] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]"
                    : "border-transparent bg-[#F2EFE6] text-[#6F7468] hover:border-[#D8D4C4] hover:bg-white hover:text-[#263227]",
                )}
              >
                <Icon size={16} strokeWidth={1.55} />
                {selected ? (
                  <span className="absolute right-[3px] top-[3px] flex h-[7px] w-[7px] items-center justify-center rounded-full bg-[#53673A]">
                    <svg viewBox="0 0 10 10" className="h-[4px] w-[4px]" fill="none" stroke="#F3F7E6" strokeWidth="1.7">
                      <path d="M2 5.3 4.1 7.2 8 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : mode === "similar" && score >= threshold ? (
                  <span className="absolute right-1 top-1 h-[3px] w-[3px] rounded-full bg-[#8BA052]" />
                ) : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="col-span-6 py-10 text-center text-[10px] text-[#969889]">No icons match that search.</div>
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#FBFAF6] to-transparent" />
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-[#E7E3D8] bg-[#FBFAF6] px-4 py-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[12px] font-semibold text-[#2D382E]">{selectedIds.length}</span>
            <span className="text-[9.5px] text-[#909385]">of {capacity} cells</span>
            {lockedCount > 0 ? (
              <span className="ml-1 rounded bg-[#E9EFD3] px-1 py-0.5 font-mono text-[8px] text-[#566829]">
                {lockedCount} locked
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 h-[2px] w-[138px] overflow-hidden rounded-full bg-[#E6E3D8]">
            <div
              className="h-full rounded-full bg-[#8FA153] transition-all duration-300"
              style={{ width: `${Math.min(100, (selectedIds.length / capacity) * 100)}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#8F9284] transition-colors hover:text-[#333E33]"
        >
          Clear
        </button>
      </div>
    </aside>
  );
}
