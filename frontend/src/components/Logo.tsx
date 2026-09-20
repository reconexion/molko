export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} role="img" aria-label="Molko">
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.5" fill="var(--color-bg-brand-solid)" stroke="var(--color-border-primary)" strokeWidth="1.5" />
      <text
        x="18"
        y="19"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display)"
        fontWeight={800}
        fontSize={20}
        fill="var(--color-neutral-900)"
      >
        M
      </text>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="hidden text-lg font-bold tracking-tight text-primary sm:inline">Molko</span>
    </div>
  );
}
