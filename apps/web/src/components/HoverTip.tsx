// Tooltip that follows the pointer over a chart. The same facts are always reachable by keyboard
// (charts announce them through a live region), so hover is never the only way (a11y).
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface Tip { x: number; y: number; content: ReactNode }

export function useHoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  return {
    tip,
    show: (e: { clientX: number; clientY: number }, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content }),
    hide: () => setTip(null),
  };
}

export function HoverTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  const flipX = tip.x > window.innerWidth - 280;
  const flipY = tip.y > window.innerHeight - 140;
  return createPortal(
    <div className="hovertip" role="presentation"
      style={{ left: flipX ? undefined : tip.x + 14, right: flipX ? window.innerWidth - tip.x + 14 : undefined, top: flipY ? undefined : tip.y + 16, bottom: flipY ? window.innerHeight - tip.y + 12 : undefined }}>
      {tip.content}
    </div>,
    document.body,
  );
}
