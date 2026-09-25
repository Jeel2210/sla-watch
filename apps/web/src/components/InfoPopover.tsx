// "i" button that explains a number (DESIGN.md → Info pop-up). Opens on click/tap, not hover-only (a11y);
// closes on a second click, Escape, a click elsewhere, or scrolling.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function InfoPopover({ label, children, trigger }: { label: string; children: ReactNode; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

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
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={trigger ? 'kbtn' : 'info'} aria-label={label} aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)}>
        {trigger ?? 'i'}
      </button>
      {open && createPortal(
        <div ref={pop} id={id} role="tooltip" className="pop" style={{ left: pos.left, top: pos.top }}>{children}</div>,
        document.body,
      )}
    </>
  );
}
