// SearchField.tsx — the one search box of every list tab (2026-11-04): a
// labelled `type="search"` input whose text goes to the tab's filter, matched by
// lib/textsearch. `look` picks the tab's control family so it sits in its bar:
// "svg" (Generate SVG, SVG to upload, Upload) or "v2" (Selection V2, Batch).

export interface SearchFieldProps {
  testid: string;
  value: string;
  onChange: (value: string) => void;
  /** What this tab can be searched by, e.g. "Filename, folder or status…". */
  placeholder?: string;
  look?: "svg" | "v2";
}

export default function SearchField(p: SearchFieldProps) {
  const look = p.look ?? "svg";
  return (
    <label className={`${look}-field`}>
      <span className={`${look}-label`}>Search</span>
      <input className={`${look}-input`} data-testid={p.testid} type="search" aria-label="Search by name, folder or status"
        placeholder={p.placeholder ?? "Name, folder or status…"} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
    </label>
  );
}
