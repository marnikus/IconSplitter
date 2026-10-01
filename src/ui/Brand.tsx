// Brand.tsx — app mark + wordmark in the top bar (design: purple tile + name).

export default function Brand() {
  return (
    <div className="flex items-center gap-2" data-testid="app-brand">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-white" strokeWidth="2">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M3 14l4-4 5 5 3-3 6 6" />
          <path d="M7 21h10" />
        </svg>
      </span>
      <span className="text-base font-semibold tracking-tight">Image Operator</span>
    </div>
  );
}
