import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "../utils/cn";

export function PanelSection({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-[#E7E3D8]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[#F7F4EC]"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-[#232823]">
          {title}
          {badge ? (
            <span className="rounded-full bg-[#EBE7DB] px-1.5 py-0.5 font-mono text-[9px] font-normal text-[#727468]">
              {badge}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={cn("text-[#8A8C7D] transition-transform duration-200", !open && "-rotate-90")}
        />
      </button>
      {open ? <div className="space-y-4 px-5 pb-5">{children}</div> : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  inline,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={cn("min-w-0", inline ? "flex items-center justify-between gap-3" : "space-y-2")}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">{label}</span>
        {hint ? <span className="text-[10px] text-[#A3A496]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 9999,
  suffix,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
  className?: string;
}) {
  const id = useId();
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, Math.round(parsed))));
  };
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex h-9 flex-1 items-center gap-1.5 rounded-lg border border-[#DFDCD1] bg-white px-2.5 focus-within:border-[#8F9A61] focus-within:ring-2 focus-within:ring-[#D9E8A5]/50",
        className,
      )}
    >
      <span className="text-[9px] font-medium uppercase tracking-wider text-[#A0A192]">{label}</span>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => commit(event.target.value)}
        className="w-full min-w-0 appearance-none bg-transparent text-right font-mono text-[11px] font-medium text-[#282D28] outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix ? <span className="text-[9px] text-[#A0A192]">{suffix}</span> : null}
    </label>
  );
}

export function RangeField({
  value,
  onChange,
  min,
  max,
  step = 1,
  display,
  label,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  display?: string;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">{label}</span>
        <span className="rounded-md bg-[#F0EDE2] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#4A4F44]">
          {display ?? value}
          {suffix ? <span className="text-[8px] text-[#9A9B8C]">{suffix}</span> : null}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sheet-range w-full"
        style={{
          background: `linear-gradient(to right, #263629 0%, #263629 ${((value - min) / (max - min)) * 100}%, #E3E0D4 ${((value - min) / (max - min)) * 100}%, #E3E0D4 100%)`,
        }}
      />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 24,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex h-9 items-center justify-between rounded-lg border border-[#DFDCD1] bg-white px-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-6 w-6 items-center justify-center rounded text-[#828477] transition-colors hover:bg-[#F1EEE4] hover:text-[#252A25]"
        aria-label="Decrease"
      >
        <Minus size={11} />
      </button>
      <span className="font-mono text-[11px] font-medium text-[#252A25]">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-6 w-6 items-center justify-center rounded text-[#828477] transition-colors hover:bg-[#F1EEE4] hover:text-[#252A25]"
        aria-label="Increase"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

const SWATCHES = [
  "#17271F",
  "#202A24",
  "#3D5A44",
  "#D9F36C",
  "#F4F0E7",
  "#FBFAF6",
  "#E7B37C",
  "#C96B4B",
  "#3565A8",
  "#8E7CC3",
  "#FFFFFF",
  "#000000",
];

export function ColorField({
  value,
  onChange,
  label,
  swatches = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  swatches?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">{label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wide text-[#939587]">{value}</span>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor={id}
          className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10 shadow-[inset_0_0_0_3px_rgba(255,255,255,0.72)]"
          style={{ backgroundColor: value }}
          title="Choose custom color"
        >
          <input
            id={id}
            type="color"
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {swatches ? (
          <div className="flex flex-1 items-center gap-1.5">
            {SWATCHES.slice(0, 8).map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => onChange(swatch)}
                aria-label={`Use ${swatch}`}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-110",
                  value.toLowerCase() === swatch.toLowerCase() ? "border-[#2C362B]" : "border-black/10",
                )}
                style={{ backgroundColor: swatch }}
              >
                {value.toLowerCase() === swatch.toLowerCase() ? (
                  <Check
                    size={10}
                    strokeWidth={2.5}
                    style={{ color: ["#F4F0E7", "#FBFAF6", "#D9F36C", "#FFFFFF"].includes(swatch) ? "#283126" : "#FFFFFF" }}
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-[#86887A]">{value}</span>
        )}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-[11px] font-medium text-[#333A33]">{label}</span>
        {description ? <span className="mt-0.5 block text-[10px] leading-snug text-[#969889]">{description}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-[18px] w-[31px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-[#2A3B2D]" : "bg-[#D8D5C9]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[15px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-[#E0DDD2] bg-[#F3F0E7] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-all",
            compact ? "h-7 px-1.5 text-[9px]" : "h-8 px-2 text-[10px]",
            value === option.value
              ? "bg-white text-[#202820] shadow-[0_1px_2px_rgba(30,35,25,0.12)]"
              : "text-[#8A8C7D] hover:text-[#454D41]",
          )}
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = useId();
  const classes =
    "w-full rounded-lg border border-[#DFDCD1] bg-white px-2.5 text-[11px] text-[#2D332C] outline-none transition-colors placeholder:text-[#B0B1A5] focus:border-[#8F9A61] focus:ring-2 focus:ring-[#D9E8A5]/50";
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#787A6D]">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(classes, "resize-none py-2 leading-relaxed")}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(classes, "h-8.5 py-1.5")}
        />
      )}
    </label>
  );
}
