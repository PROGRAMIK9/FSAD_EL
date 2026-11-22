import { useCallback, useEffect, useRef, useState } from 'react';

const read = (key, fallback) => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Two panes with a draggable divider. The divider is a focusable `separator`: arrow keys move it
 * by 2% (Shift: 10%), Home/End jump to the limits, Enter or double-click restores the default.
 * The split (in % of the first pane) is remembered per `id`.
 *
 * Below the `lg` breakpoint the panes simply stack, without a divider.
 */
export function SplitPane({ id, direction = 'horizontal', initial = 50, min = 20, max = 80, label = 'Resize panes', first, second, className = '' }) {
  const key = `split:${id}`;
  const [pct, setPct] = useState(() => read(key, initial));
  const box = useRef(null);
  const dragging = useRef(false);
  const horizontal = direction === 'horizontal';

  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max]);
  const save = useCallback(
    (v) => {
      setPct(v);
      try {
        localStorage.setItem(key, String(Math.round(v * 10) / 10));
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  );

  useEffect(() => {
    const move = (e) => {
      if (!dragging.current || !box.current) return;
      const r = box.current.getBoundingClientRect();
      const pos = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      save(clamp(pos * 100));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [horizontal, clamp, save]);

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const fwd = horizontal ? 'ArrowRight' : 'ArrowDown';
    let next;
    if (e.key === back) next = pct - step;
    else if (e.key === fwd) next = pct + step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter') next = initial;
    else return;
    e.preventDefault();
    save(clamp(next));
  };

  return (
    <div ref={box} style={{ '--split': `${pct}%` }} className={`flex min-h-0 min-w-0 flex-col ${horizontal ? 'lg:flex-row' : ''} ${className}`}>
      <div className={`min-h-0 min-w-0 ${horizontal ? 'lg:w-[var(--split)] lg:shrink-0' : 'h-[var(--split)] shrink-0'}`}>{first}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(pct)}
        title={`${label}: drag, or focus and use the arrow keys`}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
          document.body.style.userSelect = 'none';
        }}
        onDoubleClick={() => save(initial)}
        onKeyDown={onKeyDown}
        className={`group relative z-10 shrink-0 touch-none items-center justify-center outline-none ${horizontal ? 'hidden w-3 cursor-col-resize lg:flex' : 'flex h-3 cursor-row-resize'}`}
      >
        <span
          className={`rounded-full bg-border transition group-hover:bg-primary group-focus-visible:bg-primary group-focus-visible:ring-4 group-focus-visible:ring-primary/25 ${horizontal ? 'h-10 w-1' : 'h-1 w-10'}`}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1">{second}</div>
    </div>
  );
}
