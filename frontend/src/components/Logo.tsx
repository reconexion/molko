export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} role="img" aria-label="Molko">
      <rect width="36" height="36" rx="10" fill="var(--color-bg-brand-solid)" />
      <text
        x="18"
        y="19"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display)"
        fontWeight={800}
        fontSize={20}
        fill="#ffffff"
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
      <span className="text-lg font-bold tracking-tight text-primary">Molko</span>
    </div>
  );
}
