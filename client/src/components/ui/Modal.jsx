import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button.jsx';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab focus inside `ref` and restores focus to the opener on unmount. */
function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const [start, end] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    };
    node?.addEventListener('keydown', onKey);
    return () => {
      node?.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [ref, active]);
}

function useEscape(onClose, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Accessible dialog. When `onSubmit` is given the body is a <form>, so Enter submits
 * and the footer's submit button works without extra wiring.
 */
export function Modal({ open = true, onClose, title, description, size = 'md', footer, onSubmit, dismissible = true, children }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useEscape(dismissible ? onClose : null, open && dismissible);
  if (!open) return null;
  const Body = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden />
      <Body
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onSubmit={
          onSubmit &&
          ((e) => {
            e.preventDefault();
            onSubmit(e);
          })
        }
        className={`relative flex max-h-[92vh] w-full ${sizes[size]} animate-scale-in flex-col rounded-t-2xl border border-border bg-surface shadow-pop sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {dismissible && <Button variant="ghost" icon={X} onClick={onClose} aria-label="Close" className="-mr-2 -mt-1" />}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </Body>
    </div>,
    document.body,
  );
}

/** Side panel that slides in from the right; used for inline editors. */
export function Drawer({ open, onClose, title, description, footer, width = 'max-w-xl', children }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40" onClick={onClose} aria-hidden />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`relative flex h-full w-full ${width} animate-slide-in flex-col border-l border-border bg-surface shadow-pop`}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label="Close" className="-mr-2" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

const ConfirmContext = createContext(null);

/**
 * Provides `useConfirm()`: `await confirm({ title, body, confirmLabel, tone, input })`.
 * Resolves to `false` when cancelled, `true` when confirmed, or the typed text when
 * `input` is set (replacing window.prompt).
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setText(opts.input?.defaultValue || '');
        setState({ ...opts, resolve });
      }),
    [],
  );
  const close = (value) => {
    state?.resolve(value);
    setState(null);
  };
  const minLength = state?.input?.minLength || 0;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          size="sm"
          title={state.title}
          onClose={() => close(false)}
          onSubmit={() => (state.input ? text.trim().length >= minLength && close(text.trim()) : close(true))}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" variant={state.tone === 'danger' ? 'danger' : 'primary'} disabled={state.input && text.trim().length < minLength}>
                {state.confirmLabel || 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="flex gap-3">
            {state.tone === 'danger' && (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1 text-sm text-muted">
              {state.body}
              {state.input && (
                <textarea
                  data-autofocus
                  className="input mt-3 min-h-[96px]"
                  placeholder={state.input.placeholder}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              )}
              {state.input && minLength > 0 && <p className="mt-1 text-xs text-subtle">At least {minLength} characters.</p>}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
