const TOKENS = [
  ["brand-navy", "--brand-navy"],
  ["brand-blue", "--brand-blue"],
  ["brand-sky", "--brand-sky"],
  ["brand-orange", "--brand-orange"],
  ["brand-grey", "--brand-grey"],
  ["brand-white", "--brand-white"],
  ["brand-deep", "--brand-deep"],
  ["ink", "--ink"],
  ["ink-muted", "--ink-muted"],
  ["surface", "--surface"],
  ["success", "--success"],
  ["danger", "--danger"],
] as const;

export function TokenSwatches() {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {TOKENS.map(([name, variable]) => (
        <li key={name}>
          <div
            className="h-16 rounded-[var(--radius-card)] border border-brand-grey"
            style={{ background: `var(${variable})` }}
          />
          <p className="mt-2 font-bold">{name}</p>
          <p className="text-sm text-ink-muted">{variable}</p>
        </li>
      ))}
    </ul>
  );
}
