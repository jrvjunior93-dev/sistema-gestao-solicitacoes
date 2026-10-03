/**
 * StatsCard — card de métrica do dashboard.
 *
 * title    : string
 * value    : string | number
 * subtitle : string (opcional)
 * icon     : ReactNode (opcional)
 * trend    : { value: number, label: string } (opcional)
 * color    : 'blue' | 'green' | 'amber' | 'red' | 'purple' (opcional)
 * loading  : boolean
 */
export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'blue',
  loading = false,
}) {
  const colorMap = {
    blue:   { accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    green:  { accent: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    amber:  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    red:    { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    purple: { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  };
  const c = colorMap[color] ?? colorMap.blue;

  const trendPositive = trend && trend.value >= 0;

  if (loading) {
    return (
      <div className="card sol-surface-card animate-pulse">
        <div className="h-3 w-24 rounded bg-[var(--ui-border)]" />
        <div className="mt-3 h-7 w-16 rounded bg-[var(--ui-border)]" />
      </div>
    );
  }

  return (
    <div className="card sol-surface-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-medium leading-tight"
          style={{ color: 'var(--c-muted)' }}
        >
          {title}
        </p>

        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: c.bg, color: c.accent }}
          >
            {icon}
          </span>
        )}
      </div>

      <div>
        <p
          className="text-3xl font-bold leading-none"
          style={{ color: 'var(--c-text)' }}
        >
          {value ?? '—'}
        </p>

        {subtitle && (
          <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {trend && (
        <div className="flex items-center gap-1">
          <span
            className="text-xs font-semibold"
            style={{ color: trendPositive ? '#10b981' : '#ef4444' }}
          >
            {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
            {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}
