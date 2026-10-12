// DropzoneEmpty.tsx — empty state for Single sheets tab
// Centered dropzone card, kept at max-w-2xl for readability while the outer
// main is full width (w-full). Clicking opens the file picker.

type Props = { onPick: () => void };

export default function DropzoneEmpty({ onPick }: Props) {
  return (
    <div
      data-testid="dropzone"
      onClick={onPick}
      className="mx-auto mt-10 flex max-w-2xl cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.03] px-6 py-20 text-center transition hover:border-indigo-400/60 hover:bg-white/[0.06]"
    >
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-500/15 text-3xl">🖼️</div>
      <h2 className="text-2xl font-semibold">Drop your icon sheets here</h2>
      <p className="mt-2 max-w-md text-slate-400">
        Upload one or many images that contain several icons. Every icon is found automatically, cropped exactly
        and exported as a same-size square with small padding.
      </p>
      <span className="btn-primary mt-6">Choose images</span>
      <p className="mt-4 text-xs text-slate-500">PNG · JPG · WEBP — processed locally, nothing is uploaded</p>
    </div>
  );
}
