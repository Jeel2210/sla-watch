// Help icon that explains a number (DESIGN.md → Info pop-up), the same everywhere a value has a formula.
// Hover peeks; click keeps it open; a second click, ×, Escape, or a click elsewhere closes it.
// Only one is open at a time: opening one tells the others to close.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const OPENED = 'sla:help-opened';

export function HelpIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" /><path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.7-2.8 2.7" /><path d="M12 16.8h.01" />
    </svg>
  );
}

type Mode = 'closed' | 'peek' | 'pinned';

export function InfoPopover({ label, title, children }: { label: string; title: ReactNode; children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('closed');
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = mode !== 'closed';

  const show = (next: Mode) => {
    setMode(next);
    window.dispatchEvent(new CustomEvent(OPENED, { detail: id }));
  };
  const close = (refocus = false) => {
    setMode('closed');
    if (refocus) btn.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    setPos({
      left: Math.min(Math.max(8, b.left + b.width / 2 - w / 2), window.innerWidth - w - 8),
      top: b.bottom + 8 + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 8) : b.bottom + 8,
    });
  }, [open]);

  useEffect(() => {
    const onOther = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setMode('closed'); };
    window.addEventListener(OPENED, onOther);
    return () => window.removeEventListener(OPENED, onOther);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onScroll = () => { if (mode === 'peek') close(); };
    const onResize = () => close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open, mode]);

  return (
    <>
      <button ref={btn} type="button" className="help" aria-label={label} aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (mode === 'pinned' ? close() : show('pinned'))}
        onMouseEnter={() => { if (mode === 'closed') show('peek'); }}
        onMouseLeave={() => { if (mode === 'peek') close(); }}>
        <HelpIcon />
      </button>
      {open && createPortal(
        <div ref={pop} id={id} role="tooltip" className="pop" style={{ left: pos.left, top: pos.top }}
          onMouseEnter={() => { if (mode === 'peek') setMode('pinned'); }}>
          <div className="pop-head">
            <b>{title}</b>
            <button type="button" className="pop-close" aria-label="Close" onClick={() => close(true)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
