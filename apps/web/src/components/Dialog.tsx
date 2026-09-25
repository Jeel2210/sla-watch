// Modal dialog on the native <dialog>: focus trap, Escape and the top layer come from the browser.
import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ open, onClose, title, children, className = '', headerExtra }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; className?: string; headerExtra?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  return (
    <dialog ref={ref} className={className} aria-label={typeof title === 'string' ? title : undefined}
      onClose={onClose} onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="dlg-head">
            <div className="dlg-title">{typeof title === 'string' ? <h2>{title}</h2> : title}</div>
            {headerExtra}
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}
