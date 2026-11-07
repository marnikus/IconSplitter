import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Grid3X3,
  Layers3,
  ListChecks,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { COPY_READY_PROMPT, PROMPT_DECISIONS } from "../data/prompt";
import { cn } from "../utils/cn";

type PromptBriefProps = {
  open: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
};

const chapters = [
  { id: "brief-intent", number: "01", label: "Intent & scope" },
  { id: "brief-structure", number: "02", label: "Structured prompt" },
  { id: "brief-decisions", number: "03", label: "Decisions to confirm" },
  { id: "brief-acceptance", number: "04", label: "Acceptance & output" },
];

const promptSections = [
  {
    title: "Input contract",
    icon: Layers3,
    body: "Import a batch of stroke-only SVGs with optional metadata ({ id, name, category, tags[] }). Infer tags from filenames when absent, normalize every viewBox, preserve paths, and let one global style drive stroke color and caps.",
  },
  {
    title: "Selection recipes",
    icon: Sparkles,
    body: "Three visible modes: random from all, random from a filter, or ≥70% metadata similarity to a reference collection. Expose the formula, seed, locks, no-duplicates rule, and fallback policy.",
  },
  {
    title: "Containment system",
    icon: Grid3X3,
    body: "Respect a strict hierarchy — artboard → free area → grid → icon box. Scale every glyph proportionally to the box, include stroke thickness in the bounds, and surface an auto-fit warning instead of clipping silently.",
  },
  {
    title: "Flexible masthead",
    icon: Wand2,
    body: "Banner on any side or none. Two editable title lines, each with its own type treatment; solid or split fill; optional hero glyph and accent rule. All values update the sheet in real time.",
  },
  {
    title: "Output quality",
    icon: ArrowUpRight,
    body: "Editable SVG with strokes and text preserved; transparent PNG at 1×/2×/3×; saved presets including the seed. Recreate all three references: plain grid, split top masthead, and side banner with captions.",
  },
];

const acceptance = [
  "No icon or stroke crosses its box at any size, stroke weight or zoom.",
  "Stroke, colors, grid, banner and typography update instantly.",
  "Same seed + settings reproduce the same sheet, always.",
  "Sub-threshold icons appear only through opt-in fallback, with a notice.",
  "Similarity formula and threshold are visible beside the recipe.",
  "Banners support left, right, top, bottom and none.",
  "Every export preserves crisp, editable outline geometry.",
  "Empty cells and too-small libraries have explicit, non-surprising states.",
];

export function PromptBrief({ open, onClose, onNotify }: PromptBriefProps) {
  const [view, setView] = useState<"brief" | "raw">("brief");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setView("brief");
    }
  }, [open]);

  if (!open) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(COPY_READY_PROMPT);
      setCopied(true);
      onNotify("Generation prompt copied to clipboard");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      onNotify("Clipboard access was blocked — select the raw prompt to copy it.");
      setView("raw");
    }
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101710]/60 p-3 backdrop-blur-[3px] md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Icon Sheet Constructor generation brief"
        className="flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#FCFBF7] shadow-[0_32px_90px_rgba(10,18,12,0.38)]"
      >
        <header className="flex h-[62px] shrink-0 items-center justify-between gap-4 border-b border-[#E6E1D5] px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#233428] text-[#D9F36C]">
              <Wand2 size={14} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-[#232B24]">Generation brief</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#A0A192]">v1.0</span>
              </div>
              <p className="hidden text-[9px] text-[#939587] sm:block">Corrected, scoped and ready for a build model</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-lg border border-[#E2DED2] bg-[#F3F0E7] p-0.5 sm:flex">
              <button
                type="button"
                onClick={() => setView("brief")}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[9.5px] font-medium transition-colors",
                  view === "brief" ? "bg-white text-[#293229] shadow-sm" : "text-[#8A8D7E]",
                )}
              >
                Brief
              </button>
              <button
                type="button"
                onClick={() => setView("raw")}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[9.5px] font-medium transition-colors",
                  view === "raw" ? "bg-white text-[#293229] shadow-sm" : "text-[#8A8D7E]",
                )}
              >
                Raw prompt
              </button>
            </div>
            <button
              type="button"
              onClick={copyPrompt}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#25362A] px-3 text-[10px] font-semibold text-[#F8F5EA] transition-colors hover:bg-[#1A271E]"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy prompt"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close brief"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#838678] transition-colors hover:bg-[#F0EDE3] hover:text-[#293229]"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {view === "raw" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#1B251E] p-5 md:p-8">
            <div className="mx-auto max-w-[760px]">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#AABF85]">
                  copy-ready / markdown
                </span>
                <span className="font-mono text-[9px] text-[#71806E]">{COPY_READY_PROMPT.length.toLocaleString()} chars</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[1.9] text-[#DCE4D2]">{COPY_READY_PROMPT}</pre>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <nav className="hidden w-[222px] shrink-0 flex-col border-r border-[#E6E1D5] bg-[#F6F3EA] p-4 md:flex">
              <div className="mb-3 px-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#9B9D8F]">In this brief</div>
              <div className="space-y-0.5">
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => scrollTo(chapter.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#ECE8DB]"
                  >
                    <span className="font-mono text-[8.5px] text-[#A5A797] group-hover:text-[#78894A]">{chapter.number}</span>
                    <span className="text-[10.5px] font-medium text-[#5E6557] group-hover:text-[#263026]">{chapter.label}</span>
                  </button>
                ))}
              </div>
              <div className="mx-2 my-4 h-px bg-[#E1DDD0]" />
              <div className="rounded-xl border border-[#E2DED1] bg-[#FBFAF6] p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#E9EFD1] text-[#687C38]">
                    <ListChecks size={10} />
                  </div>
                  <span className="text-[9.5px] font-semibold text-[#3D463B]">Scope at a glance</span>
                </div>
                <ul className="space-y-1.5 text-[9px] leading-relaxed text-[#85897A]">
                  <li className="flex gap-1.5"><span className="text-[#8EA253]">●</span> 3 selection modes</li>
                  <li className="flex gap-1.5"><span className="text-[#8EA253]">●</span> Adaptive banner</li>
                  <li className="flex gap-1.5"><span className="text-[#8EA253]">●</span> Stroke-safe icon boxes</li>
                  <li className="flex gap-1.5"><span className="text-[#8EA253]">●</span> Editable SVG output</li>
                </ul>
              </div>
              <div className="mt-auto pt-4">
                <p className="px-2 text-[8.5px] leading-relaxed text-[#A4A596]">
                  Format: implementation prompt
                  <br />
                  Reading time: 4 minutes
                </p>
              </div>
            </nav>

            <main id="brief-scroll" className="sheet-scroll min-h-0 flex-1 overflow-y-auto px-5 py-7 md:px-9 md:py-9">
              <div className="mx-auto max-w-[690px]">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full border border-[#DDE4C5] bg-[#F1F5E4] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#6B7D3B]">
                    Corrected prompt
                  </span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#A1A394]">
                    web app · v1.0
                  </span>
                </div>
                <h1 className="font-['Instrument_Serif'] text-[38px] leading-[0.98] tracking-[-0.02em] text-[#1F2B22] md:text-[46px]">
                  Icon Sheet <em className="text-[#6B7E3D]">Constructor</em>
                </h1>
                <p className="mt-3 max-w-[580px] text-[12px] leading-[1.75] text-[#737A6C]">
                  Your original request, rewritten as an implementation brief: clear selection semantics, a real
                  containment rule for every glyph, configurable banners, live styling, and a defined export contract.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["03", "selection modes"],
                    ["70%", "tag-match default"],
                    ["4 + 1", "banner positions"],
                    ["SVG", "native output"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-lg border border-[#E7E3D7] bg-[#FBFAF6] px-2.5 py-2">
                      <div className="font-mono text-[12px] font-medium text-[#354333]">{value}</div>
                      <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.08em] text-[#9A9C8E]">{label}</div>
                    </div>
                  ))}
                </div>

                <section id="brief-intent" className="scroll-mt-5 pt-9">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#98A178]">01</span>
                    <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#263027]">Intent & scope</h2>
                    <span className="ml-1 h-px flex-1 bg-[#E9E5D9]" />
                  </div>
                  <div className="rounded-xl border border-[#E2DED2] bg-[#F8F5ED] p-4">
                    <p className="text-[11.5px] leading-[1.75] text-[#60685B]">
                      Build a browser-based constructor that turns a tagged library of <strong className="font-semibold text-[#364235]">stroke-only icons</strong> into a
                      presentation-ready sheet. Users choose a selection recipe, set up an artboard and grid, choose an
                      icon box, style the strokes, and add an optional title banner. Every change appears live, and the
                      finished composition exports as an editable vector file.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-[#E6E2D6] bg-white/70 px-3 py-2.5">
                        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8BA054]">In scope</div>
                        <p className="mt-1 text-[9.5px] leading-relaxed text-[#777C6D]">
                          Tagged selection, seeded randomness, token locks, banner composition, live preview, SVG/PNG.
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E6E2D6] bg-white/70 px-3 py-2.5">
                        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#A69B83]">Out of scope</div>
                        <p className="mt-1 text-[9.5px] leading-relaxed text-[#777C6D]">
                          Drawing new icons, editing path geometry, user accounts, or collaborative cloud documents.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                      ["Random", "From the full library. Reproducible with a seed."],
                      ["Filtered", "From a category or a tag query."],
                      ["Similar", "Shared tags ÷ reference tags, default ≥70%."],
                    ].map(([title, body], index) => (
                      <div key={title} className="rounded-xl border border-[#E6E1D5] bg-[#FCFBF7] p-3.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-[#3D473C]">{title}</span>
                          <span className="font-mono text-[8px] text-[#B0B1A3]">0{index + 1}</span>
                        </div>
                        <p className="text-[9.5px] leading-relaxed text-[#858A7C]">{body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-[#DDE5C7] bg-[#F1F5E3] px-3.5 py-3">
                    <span className="mt-0.5 rounded bg-[#DCE8B6] px-1.5 py-0.5 font-mono text-[8.5px] font-medium text-[#5A6D2B]">FORMULA</span>
                    <p className="text-[10px] leading-relaxed text-[#65724D]">
                      <strong className="font-semibold">Score = shared tags ÷ reference tags.</strong> Not Jaccard. This
                      answers “how much of the reference is represented?” and gives a stable, explainable 70% default.
                    </p>
                  </div>
                </section>

                <section id="brief-structure" className="scroll-mt-5 pt-9">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#98A178]">02</span>
                    <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#263027]">Structured prompt</h2>
                    <span className="ml-1 h-px flex-1 bg-[#E9E5D9]" />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[#E2DED2]">
                    <div className="border-b border-[#E8E4D8] bg-[#F4F1E8] px-4 py-2.5">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#969889]">
                        Six implementation groups
                      </span>
                    </div>
                    {promptSections.map((section, index) => {
                      const Icon = section.icon;
                      return (
                        <div
                          key={section.title}
                          className={cn(
                            "flex gap-3 bg-[#FCFBF7] px-4 py-3.5",
                            index !== promptSections.length - 1 && "border-b border-[#ECE8DD]",
                          )}
                        >
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EDF1DF] text-[#6C7D40]">
                            <Icon size={12} strokeWidth={1.7} />
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-[8px] text-[#B3B4A5]">{String(index + 1).padStart(2, "0")}</span>
                              <h3 className="text-[10.5px] font-semibold text-[#364134]">{section.title}</h3>
                            </div>
                            <p className="mt-1 text-[10px] leading-[1.65] text-[#7F8577]">{section.body}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 rounded-xl border border-[#E5E1D5] bg-[#F8F5ED] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#909385]">Containment hierarchy</span>
                      <span className="text-[8.5px] text-[#A1A394]">the non-negotiable rule</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium text-[#526044]">
                      {["Artboard", "Free area", "Grid", "Icon box", "Glyph + stroke"].map((item, index) => (
                        <div key={item} className="flex items-center gap-1.5">
                          <span className="rounded-md border border-[#DCE4C8] bg-[#EFF3E3] px-2 py-1">{item}</span>
                          {index < 4 ? <span className="text-[#B2B89F]">→</span> : null}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[9px] leading-relaxed text-[#939889]">
                      Auto-fit may shrink the arranged group if needed, but the stroke-aware bounds check runs at every
                      box size. Overflow is warned, never hidden.
                    </p>
                  </div>
                </section>

                <section id="brief-decisions" className="scroll-mt-5 pt-9">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#98A178]">03</span>
                    <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#263027]">Decisions to confirm</h2>
                    <span className="ml-1 h-px flex-1 bg-[#E9E5D9]" />
                  </div>
                  <p className="mb-3 text-[10.5px] leading-relaxed text-[#8A8E80]">
                    These assumptions make the prompt buildable. The recommended answer is filled in, so generation can
                    start immediately and the options can become settings later.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROMPT_DECISIONS.map((decision) => (
                      <div key={decision.number} className="rounded-xl border border-[#E5E1D5] bg-[#FCFBF7] p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[10px] font-semibold leading-snug text-[#3B463A]">
                            <span className="mr-1.5 font-mono text-[8px] font-normal text-[#ACAE9F]">{decision.number}</span>
                            {decision.question}
                          </h3>
                          <span className="shrink-0 rounded-full bg-[#EFF3E2] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.08em] text-[#7B8D4E]">
                            {decision.tag}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[9.5px] leading-[1.65] text-[#858A7B]">{decision.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section id="brief-acceptance" className="scroll-mt-5 pt-9">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#98A178]">04</span>
                    <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#263027]">Acceptance & output</h2>
                    <span className="ml-1 h-px flex-1 bg-[#E9E5D9]" />
                  </div>
                  <div className="grid gap-x-6 gap-y-2 rounded-xl border border-[#E5E1D5] bg-[#FCFBF7] p-4 sm:grid-cols-2">
                    {acceptance.map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#EAF0D7] text-[#71843E]">
                          <Check size={8.5} strokeWidth={2.6} />
                        </span>
                        <span className="text-[9.5px] leading-relaxed text-[#777E6F]">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col items-start justify-between gap-3 rounded-xl bg-[#23342A] p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#F6F4E9]">Ready to hand off</span>
                        <span className="rounded-full bg-[#D9F36C]/15 px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wider text-[#D9F36C]">
                          copy-ready
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#B6C3B3]">
                        A complete markdown brief covering selection, layout, banner, preview, export and QA.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={copyPrompt}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#D9F36C] px-3 text-[9.5px] font-semibold text-[#24331F] transition-colors hover:bg-[#E4FA89]"
                    >
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                      {copied ? "Copied" : "Copy full prompt"}
                    </button>
                  </div>
                </section>

                <div className="mt-8 flex items-center justify-between border-t border-[#E9E5D9] pt-4 pb-2">
                  <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-[#ABAC9E]">End of brief</span>
                  <button
                    type="button"
                    onClick={() => setView("raw")}
                    className="font-mono text-[8px] uppercase tracking-[0.13em] text-[#8A9666] hover:text-[#4C5B37]"
                  >
                    View raw prompt ↗
                  </button>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
