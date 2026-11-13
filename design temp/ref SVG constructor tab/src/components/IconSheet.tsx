import { forwardRef } from "react";
import { Lock } from "lucide-react";
import { ICON_BY_ID, type IconItem } from "../data/icons";
import { computeLayout, wrapTitle } from "../lib/layout";
import { FONTS, readableInk, type SheetConfig } from "../lib/sheet";
import { cn } from "../utils/cn";

const CAPTION_LABELS: Record<string, string> = {
  "utensils-crossed": "dining",
  "chef-hat": "chef hat",
  "cake-slice": "cake",
  "ice-cream": "gelato",
  "cooking-pot": "pot",
  refrigerator: "fridge",
  microwave: "micro",
  headphones: "audio",
  smartphone: "mobile",
  "map-pin": "pin",
  "badge-check": "quality",
  "file-text": "file",
  "arrow-right": "arrow",
  "cup-soda": "soda",
};

type IconSheetProps = {
  config: SheetConfig;
  icons: IconItem[];
  lockedIds?: string[];
  onToggleLock?: (id: string) => void;
  interactive?: boolean;
  className?: string;
};

export const IconSheet = forwardRef<HTMLDivElement, IconSheetProps>(function IconSheet(
  { config, icons, lockedIds = [], onToggleLock, interactive = false, className },
  ref,
) {
  const layout = computeLayout(config);
  const banner = config.banner;
  const horizontal = banner.position === "top" || banner.position === "bottom";
  const split = banner.style === "split" && banner.position !== "none";
  const heroIcon = ICON_BY_ID.get(banner.heroIconId) ?? ICON_BY_ID.get("chef-hat");
  const HeroIcon = heroIcon?.Icon;
  const sideHeroSize = horizontal ? Math.min(30, banner.size * 0.38) : Math.min(80, banner.size * 0.35);
  const titleMaxChars = horizontal
    ? 25
    : Math.max(7, Math.floor((banner.size - 56) / Math.max(9, banner.titleSize * 0.64)));
  const titleLines = wrapTitle(banner.title, titleMaxChars);
  const subtitleMaxChars = horizontal
    ? 28
    : Math.max(9, Math.floor((banner.size - 62) / Math.max(7, banner.subtitleSize * 0.72)));
  const subtitleLines = wrapTitle(banner.subtitle, subtitleMaxChars);

  const titleStyle = {
    fontFamily: FONTS[banner.titleFace].stack,
    fontSize: banner.titleSize,
    lineHeight: 1.03,
    letterSpacing: banner.titleFace === "serif" ? "-0.02em" : "-0.045em",
    fontWeight: banner.titleFace === "serif" ? 500 : 600,
  } as const;

  const subtitleStyle = {
    color: banner.subtitleColor,
    fontSize: banner.subtitleSize,
    lineHeight: 1.55,
    letterSpacing: "0.16em",
    fontFamily: FONTS.sans.stack,
  } as const;

  const titleBlockWidth = horizontal
    ? Math.min(banner.size * 4.45, config.artboard.width * 0.36)
    : banner.size;
  const splitTitleHeight = horizontal ? banner.size : Math.min(154, banner.size * 0.62);

  const titleMarkup = (color: string, fontSize = banner.titleSize) => (
    <div data-text="title" style={{ ...titleStyle, fontSize, color }} className="text-center">
      {titleLines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line || "\u00A0"}
        </span>
      ))}
    </div>
  );

  const bannerInner = () => {
    if (split) {
      return (
        <>
          <div
            data-banner-accent="true"
            className={cn(
              "absolute z-10 flex items-center justify-center overflow-hidden",
              horizontal ? "left-0 top-0 h-full" : "left-0 top-0 w-full",
            )}
            style={{
              width: horizontal ? titleBlockWidth : "100%",
              height: horizontal ? "100%" : splitTitleHeight,
              backgroundColor: banner.accent,
              color: readableInk(banner.accent),
            }}
          >
            {banner.hero && HeroIcon ? (
              <div
                data-banner-hero-ring="true"
                className={cn(
                  "flex items-center justify-center",
                  horizontal ? "mr-4 h-9 w-9 rounded-full border border-current/20" : "mr-4 h-10 w-10 rounded-full border border-current/20",
                )}
              >
                <HeroIcon data-banner-hero="true" size={horizontal ? 18 : 20} strokeWidth={1.3} />
              </div>
            ) : null}
            {titleMarkup(readableInk(banner.accent), horizontal ? banner.titleSize : banner.titleSize * 0.8)}
          </div>
          <div
            className={cn(
              "absolute z-0 flex items-center justify-center",
              horizontal ? "right-0 top-0 h-full" : "bottom-0 left-0 w-full",
            )}
            style={
              horizontal
                ? { left: titleBlockWidth, padding: "0 32px" }
                : { top: splitTitleHeight, bottom: 0, padding: "20px 24px" }
            }
          >
            <div className="text-center">
              <div data-text="subtitle" className="uppercase" style={subtitleStyle}>
                {subtitleLines.map((line, index) => (
                  <span key={`${line}-${index}`} className="block">{line || "\u00A0"}</span>
                ))}
              </div>
              {!horizontal ? (
                <div
                  className="mx-auto mt-4 h-px w-8"
                  style={{ backgroundColor: `${banner.subtitleColor}66` }}
                />
              ) : null}
            </div>
          </div>
        </>
      );
    }

    if (horizontal) {
      return (
        <div
          className="relative z-10 flex h-full items-center justify-center gap-4 px-6"
          style={{ color: banner.textColor }}
        >
          {banner.hero && HeroIcon ? (
            <HeroIcon
              data-banner-hero="true"
              size={sideHeroSize}
              strokeWidth={1.35}
              style={{ color: banner.accent }}
            />
          ) : null}
          <div className="shrink-0">{titleMarkup(banner.textColor)}</div>
          {banner.subtitle ? (
            <>
              {banner.divider ? (
                <div
                  data-banner-divider="true"
                  className="h-[26px] w-px shrink-0"
                  style={{ backgroundColor: `${banner.textColor}3D` }}
                />
              ) : null}
              <div
                data-text="subtitle"
                className="max-w-[380px] shrink-0 text-left uppercase"
                style={subtitleStyle}
              >
                {subtitleLines.map((line, index) => (
                  <span key={`${line}-${index}`} className="block">{line || "\u00A0"}</span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className="relative z-10 flex h-full flex-col items-center justify-center px-7 text-center"
        style={{ color: banner.textColor, padding: Math.max(22, Math.min(34, banner.size * 0.13)) }}
      >
        {banner.hero && HeroIcon ? (
          <div className="mb-5 flex flex-col items-center gap-4">
            <div
              data-banner-hero-ring="true"
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: Math.max(60, sideHeroSize + 38),
                height: Math.max(60, sideHeroSize + 38),
                color: banner.accent,
                border: `1px solid ${banner.accent}4D`,
              }}
            >
              <div
                data-banner-hero-ring="inner"
                className="pointer-events-none absolute inset-[7px] rounded-full opacity-50"
                style={{ border: `1px solid ${banner.accent}33` }}
              />
              <HeroIcon data-banner-hero="true" size={sideHeroSize} strokeWidth={1.1} />
            </div>
            {banner.divider ? (
              <div
                data-banner-divider="true"
                className="h-[2px] rounded-full"
                style={{ width: 34, backgroundColor: banner.accent }}
              />
            ) : null}
          </div>
        ) : banner.divider ? (
          <div
            data-banner-divider="true"
            className="mb-5 h-[2px] rounded-full"
            style={{ width: 34, backgroundColor: banner.accent }}
          />
        ) : null}
        {titleMarkup(banner.textColor)}
        {banner.subtitle ? (
          <div data-text="subtitle" className="mt-3.5 uppercase" style={subtitleStyle}>
            {subtitleLines.map((line, index) => (
              <span key={`${line}-${index}`} className="block">{line || "\u00A0"}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      data-artboard="true"
      className={cn("relative overflow-hidden", className)}
      style={{
        width: config.artboard.width,
        height: config.artboard.height,
        backgroundColor: config.artboard.background,
        borderRadius: config.artboard.radius,
      }}
    >
      {layout.banner ? (
        <div
          data-banner="true"
          className="absolute overflow-hidden"
          style={{
            left: layout.banner.left,
            top: layout.banner.top,
            width: layout.banner.width,
            height: layout.banner.height,
            backgroundColor: banner.background,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0), radial-gradient(circle at 50% 50%, currentColor 0.8px, transparent 0.9px)",
              backgroundSize: "18px 18px, 29px 29px",
              color: banner.textColor,
            }}
          />
          {bannerInner()}
        </div>
      ) : null}

      {layout.cells.map((cell) => {
        const icon = icons[cell.index];
        const locked = icon ? lockedIds.includes(icon.id) : false;
        if (!icon) {
          return (
            <div
              key={`empty-${cell.index}`}
              className="absolute"
              style={{ left: cell.left, top: cell.top, width: cell.width, height: cell.height }}
            >
              <div
                className="flex items-center justify-center rounded-[3px] border border-dashed"
                style={{
                  width: cell.iconSize,
                  height: cell.iconSize,
                  borderColor: `${config.icons.color}22`,
                  margin: "0 auto",
                }}
              >
                <span style={{ fontSize: Math.max(5, cell.iconSize * 0.19), color: `${config.icons.color}44` }}>
                  +
                </span>
              </div>
            </div>
          );
        }
        const Icon = icon.Icon;
        const innerSize = Math.max(4, cell.iconSize - config.icons.strokeWidth * 2.2);
        const captionLabel = CAPTION_LABELS[icon.id] ?? icon.id.replace(/-/g, " ");
        const rawCaptionSize = Math.max(3.4, config.grid.captionSize * layout.fitScale);
        const fittedCaptionSize = Math.max(
          3.2,
          rawCaptionSize * Math.min(1, (cell.iconSize * 0.96) / (captionLabel.length * rawCaptionSize * 0.67)),
        );
        return (
          <div
            key={`${icon.id}-${cell.index}`}
            data-cell={cell.index}
            className="group absolute"
            style={{ left: cell.left, top: cell.top, width: cell.width, height: cell.height }}
          >
            <div
              className="relative flex items-center justify-center"
              style={{ width: cell.iconSize, height: cell.iconSize, margin: "0 auto" }}
            >
              <Icon
                data-sheet-icon="true"
                size={innerSize}
                strokeWidth={config.icons.strokeWidth}
                absoluteStrokeWidth
                strokeLinecap={config.icons.linecap}
                strokeLinejoin={config.icons.linecap === "round" ? "round" : "miter"}
                style={{ color: config.icons.color, overflow: "visible" }}
              />
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onToggleLock?.(icon.id)}
                  aria-label={locked ? `Unlock ${icon.name}` : `Lock ${icon.name}`}
                  title={locked ? "Unlock this icon" : "Lock this icon while reshuffling"}
                  className={cn(
                    "absolute -right-1 -top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-[#DDD9CD] bg-white/95 text-[#5D6459] shadow-sm transition-opacity",
                    locked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Lock size={7.5} strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
            {config.grid.captions ? (
              <div
                data-caption="true"
                className="truncate text-center font-medium"
                style={{
                  marginTop: Math.max(3, config.grid.captionSize * 0.86 * layout.fitScale),
                  color: config.grid.captionColor,
                  fontSize: fittedCaptionSize,
                  lineHeight: 1.45,
                  letterSpacing: "0.075em",
                  textTransform: config.grid.captionCase === "upper" ? "uppercase" : "none",
                  fontFamily: FONTS.sans.stack,
                }}
              >
                {captionLabel}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
