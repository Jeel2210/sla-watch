// Small shared building blocks (DESIGN.md → Components). Props in, markup out: no data fetching here.
import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** One level of panels: white box, thin border, header with title left and controls right. */
export function Panel({ title, actions, children, className = '', id, headingId, compact }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; headingId?: string; compact?: boolean;
}) {
  return (
    <section className={`pnl ${className}`} id={id} aria-labelledby={headingId}>
      {(title || actions) && (
        <div className={`pnl-head${compact ? ' compact' : ''}`}>
          {typeof title === 'string' ? <h2 id={headingId}>{title}</h2> : title}
          {actions && <div className="pnl-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** SLA status: never colour alone — dot + words. `null` = no valid checks. */
export function Pill({ met, credit }: { met: boolean | null; credit?: boolean }) {
  if (met === null) return <span className="pill none"><span className="dot" />No data</span>;
  return (
    <span className={`pill ${met ? 'met' : 'missed'}`}>
      <span className="dot" />{met ? 'Met' : credit ? 'Missed · credit' : 'Missed'}
    </span>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'bad' }) {
  return <i className={`kchip${tone ? ` ${tone}` : ''}`}>{children}</i>;
}

export interface SegmentOption<T extends string> { value: T; label: ReactNode; count?: ReactNode; icon?: IconName; badge?: ReactNode }

/** Segmented control: one pressed option (tabs of a table, chart view switch). */
export function Segmented<T extends string>({ options, value, onChange, label, variant = 'tabs' }: {
  options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; label: string; variant?: 'tabs' | 'toggle';
}) {
  return (
    <div className={variant === 'tabs' ? 'tabs' : 'itoggle'} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={15} />}
          <span>{o.label}</span>
          {o.count !== undefined && <span className="c num">{o.count}</span>}
          {o.badge}
        </button>
      ))}
    </div>
  );
}

/** Shimmer placeholder while data loads; `inline` sits inside a line of text (counts, pager). */
export function Skeleton({ width = '100%', inline, height }: { width?: number | string; inline?: boolean; height?: number }) {
  return <span className={`sk${inline ? ' inline' : ''}`} style={{ width, height }} aria-hidden="true" />;
}

/** Plain sentence + next action (DESIGN.md → UX states). */
export function EmptyState({ icon = 'chart', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="ei"><Icon name={icon} size={24} /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** What went wrong and what to do (DESIGN.md → UX states: Error). */
export function ErrorBox({ title = 'Something went wrong', error, onRetry }: { title?: string; error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="errbox" role="alert">
      <b>{title}</b>
      <span>{message}</span>
      {onRetry && <div><button type="button" className="btn small" onClick={onRetry}>Try again</button></div>}
    </div>
  );
}
