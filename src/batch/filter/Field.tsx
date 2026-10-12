// Field.tsx — shared field wrapper for Batch filter

export default function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="v2-field">
      <span className="v2-label">{label}</span>
      {children}
    </label>
  );
}
