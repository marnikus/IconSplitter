import { AlignCenter, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus } from "lucide-react";
import { ICONS } from "../data/icons";
import type { BannerPosition, BannerStyle, SheetConfig, TextFace } from "../lib/sheet";
import { cn } from "../utils/cn";
import {
  ColorField,
  Field,
  NumberField,
  PanelSection,
  RangeField,
  Segment,
  Stepper,
  TextField,
  Toggle,
} from "./ui";

type ControlsPanelProps = {
  config: SheetConfig;
  onChange: (config: SheetConfig) => void;
  onReset: () => void;
};

function MiniColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-lg border border-[#DFDCD1] bg-white px-2">
      <span
        className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full border border-black/10"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-[#575D50]">{label}</span>
      <span className="font-mono text-[8px] uppercase text-[#9A9C8E]">{value.replace("#", "")}</span>
    </label>
  );
}

const positionOptions: Array<{ value: BannerPosition; label: string; icon: React.ReactNode }> = [
  { value: "left", label: "Left", icon: <ArrowLeft size={10} /> },
  { value: "top", label: "Top", icon: <ArrowUp size={10} /> },
  { value: "bottom", label: "Bottom", icon: <ArrowDown size={10} /> },
  { value: "right", label: "Right", icon: <ArrowRight size={10} /> },
  { value: "none", label: "None", icon: <Minus size={10} /> },
];

export function ControlsPanel({ config, onChange, onReset }: ControlsPanelProps) {
  const set = <K extends keyof SheetConfig>(section: K, patch: Partial<SheetConfig[K]>) => {
    onChange({
      ...config,
      [section]: {
        ...config[section],
        ...patch,
      },
    });
  };

  const sideBanner = config.banner.position === "left" || config.banner.position === "right";
  const bannerHidden = config.banner.position === "none";

  return (
    <aside className="flex h-full w-[318px] shrink-0 flex-col border-l border-[#E3DFD3] bg-[#FBFAF6]">
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#E7E3D8] px-5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-[-0.015em] text-[#252B25]">Customize</span>
          <span className="h-1 w-1 rounded-full bg-[#AEB77C]" />
          <span className="text-[9.5px] text-[#9A9C8E]">live</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#999B8D] transition-colors hover:text-[#343D34]"
        >
          Reset
        </button>
      </div>

      <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto">
        <PanelSection title="Artboard" badge={`${config.artboard.width}×${config.artboard.height}`} defaultOpen={false}>
          <div className="flex gap-2">
            <NumberField
              label="W"
              value={config.artboard.width}
              min={320}
              max={3000}
              suffix="px"
              onChange={(value) => set("artboard", { width: value })}
            />
            <NumberField
              label="H"
              value={config.artboard.height}
              min={240}
              max={3000}
              suffix="px"
              onChange={(value) => set("artboard", { height: value })}
            />
          </div>
          <ColorField
            label="Canvas"
            value={config.artboard.background}
            onChange={(value) => set("artboard", { background: value })}
          />
          <div className="flex gap-2">
            <NumberField
              label="Pad"
              value={config.artboard.padding}
              min={0}
              max={160}
              suffix="px"
              onChange={(value) => set("artboard", { padding: value })}
            />
            <NumberField
              label="Radius"
              value={config.artboard.radius}
              min={0}
              max={64}
              suffix="px"
              onChange={(value) => set("artboard", { radius: value })}
            />
          </div>
        </PanelSection>

        <PanelSection title="Grid" badge={`${config.grid.columns} × ${config.grid.rows}`} defaultOpen>
          <Field label="Columns / rows" inline>
            <div className="flex w-[120px] gap-1.5">
              <Stepper
                value={config.grid.columns}
                min={1}
                max={16}
                onChange={(value) => set("grid", { columns: value })}
              />
              <Stepper
                value={config.grid.rows}
                min={1}
                max={12}
                onChange={(value) => set("grid", { rows: value })}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <RangeField
              label="Gap X"
              value={config.grid.gapX}
              min={0}
              max={60}
              onChange={(value) => set("grid", { gapX: value })}
            />
            <RangeField
              label="Gap Y"
              value={config.grid.gapY}
              min={0}
              max={60}
              onChange={(value) => set("grid", { gapY: value })}
            />
          </div>
          <div className="border-t border-[#EBE7DC] pt-3">
            <Toggle
              checked={config.grid.captions}
              onChange={(value) => set("grid", { captions: value })}
              label="Captions below icons"
              description="Name label under every glyph"
            />
          </div>
          {config.grid.captions ? (
            <div className="space-y-3 rounded-lg border border-[#E8E3D7] bg-[#F7F4EC] p-2.5">
              <MiniColor
                label="Caption ink"
                value={config.grid.captionColor}
                onChange={(value) => set("grid", { captionColor: value })}
              />
              <RangeField
                label="Caption size"
                value={config.grid.captionSize}
                min={5}
                max={13}
                suffix="px"
                onChange={(value) => set("grid", { captionSize: value })}
              />
              <Segment
                compact
                value={config.grid.captionCase}
                onChange={(value) => set("grid", { captionCase: value })}
                options={[
                  { value: "upper", label: "UPPERCASE" },
                  { value: "normal", label: "Capitalized" },
                ]}
              />
            </div>
          ) : null}
        </PanelSection>

        <PanelSection title="Icon style" badge="fit to box" defaultOpen>
          <div className="rounded-lg border border-[#DDE4C8] bg-[#F2F5E7] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[9.5px] font-medium text-[#596A34]">
              <AlignCenter size={11} />
              Proportional fit · stroke-aware bounds
            </p>
          </div>
          <RangeField
            label="Icon box"
            value={config.icons.box}
            min={18}
            max={120}
            display={`${config.icons.box} × ${config.icons.box}`}
            suffix="px"
            onChange={(value) => set("icons", { box: value })}
          />
          <RangeField
            label="Stroke width"
            value={config.icons.strokeWidth}
            min={0.5}
            max={5}
            step={0.1}
            display={config.icons.strokeWidth.toFixed(1)}
            suffix="px"
            onChange={(value) => set("icons", { strokeWidth: value })}
          />
          <ColorField
            label="Stroke color"
            value={config.icons.color}
            onChange={(value) => set("icons", { color: value })}
          />
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">
              Line ends
            </span>
            <Segment
              value={config.icons.linecap}
              onChange={(value) => set("icons", { linecap: value })}
              options={[
                { value: "round", label: "Round" },
                { value: "square", label: "Square" },
              ]}
            />
          </div>
        </PanelSection>

        <PanelSection title="Banner" badge={bannerHidden ? "hidden" : config.banner.position} defaultOpen>
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">Position</span>
            <Segment compact value={config.banner.position} onChange={(value) => set("banner", { position: value })} options={positionOptions} />
          </div>

          {!bannerHidden ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">Masthead</span>
                <div className="w-[154px]">
                  <Segment
                    compact
                    value={config.banner.style}
                    onChange={(value: BannerStyle) => set("banner", { style: value })}
                    options={[
                      { value: "solid", label: "Solid" },
                      { value: "split", label: "Split" },
                    ]}
                  />
                </div>
              </div>
              <RangeField
                label={sideBanner ? "Banner width" : "Banner height"}
                value={config.banner.size}
                min={sideBanner ? 120 : 50}
                max={sideBanner ? 420 : 180}
                suffix="px"
                onChange={(value) => set("banner", { size: value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  swatches={false}
                  label="Banner"
                  value={config.banner.background}
                  onChange={(value) => set("banner", { background: value })}
                />
                <ColorField
                  swatches={false}
                  label="Accent"
                  value={config.banner.accent}
                  onChange={(value) => set("banner", { accent: value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniColor
                  label="Title ink"
                  value={config.banner.textColor}
                  onChange={(value) => set("banner", { textColor: value })}
                />
                <MiniColor
                  label="Subtitle"
                  value={config.banner.subtitleColor}
                  onChange={(value) => set("banner", { subtitleColor: value })}
                />
              </div>
              <div className="space-y-2.5 rounded-lg border border-[#E8E3D7] bg-[#F7F4EC] p-2.5">
                <TextField
                  label="Main title"
                  value={config.banner.title}
                  onChange={(value) => set("banner", { title: value })}
                  placeholder="Food icons"
                />
                <TextField
                  label="Supporting title"
                  value={config.banner.subtitle}
                  onChange={(value) => set("banner", { subtitle: value })}
                  placeholder="Editable stroke width"
                />
                <div className="grid grid-cols-2 gap-3">
                  <RangeField
                    label="Title"
                    value={config.banner.titleSize}
                    min={10}
                    max={48}
                    onChange={(value) => set("banner", { titleSize: value })}
                  />
                  <RangeField
                    label="Subtitle"
                    value={config.banner.subtitleSize}
                    min={5}
                    max={26}
                    onChange={(value) => set("banner", { subtitleSize: value })}
                  />
                </div>
                <Segment
                  value={config.banner.titleFace}
                  onChange={(value: TextFace) => set("banner", { titleFace: value })}
                  options={[
                    { value: "sans", label: "Aa Grotesk" },
                    { value: "serif", label: "Aa Editorial" },
                    { value: "mono", label: "Aa Mono" },
                  ]}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Toggle
                    checked={config.banner.hero}
                    onChange={(value) => set("banner", { hero: value })}
                    label="Hero glyph"
                  />
                </div>
                <div className="flex-1 border-l border-[#E9E5D9] pl-4">
                  <Toggle
                    checked={config.banner.divider}
                    onChange={(value) => set("banner", { divider: value })}
                    label="Accent rule"
                  />
                </div>
              </div>
              {config.banner.hero ? (
                <label className="flex h-8 items-center gap-2 rounded-lg border border-[#DFDCD1] bg-white px-2.5">
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-[#969889]">Glyph</span>
                  <select
                    value={config.banner.heroIconId}
                    onChange={(event) => set("banner", { heroIconId: event.target.value })}
                    className="w-full appearance-none bg-transparent text-right text-[10px] font-medium text-[#444D41] outline-none"
                  >
                    {ICONS.slice(0, 44).map((icon) => (
                      <option key={icon.id} value={icon.id}>
                        {icon.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : (
            <div
              className={cn(
                "rounded-lg border border-dashed border-[#DAD6C8] bg-[#F7F4EC] px-3 py-4",
                "text-center text-[10px] leading-relaxed text-[#929486]",
              )}
            >
              Banner hidden. The full artboard is available for your grid.
            </div>
          )}
        </PanelSection>

        <div className="px-5 py-4">
          <div className="flex items-center gap-2 rounded-lg bg-[#F1EFE6] px-3 py-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E3EAC9]">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-[#687C38]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 6.2 4.6 9 10 3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[9.5px] leading-snug text-[#777C6A]">
              Every glyph is scaled inside its box. Strokes never cross the edge.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
