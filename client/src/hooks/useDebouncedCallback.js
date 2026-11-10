import { useCallback, useEffect, useRef } from 'react';

/** Returns a debounced version of `fn` plus `flush()` to run any pending call immediately. */
export function useDebouncedCallback(fn, delay) {
  const fnRef = useRef(fn);
  const timer = useRef();
  const pending = useRef();
  fnRef.current = fn;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) {
      const args = pending.current;
      pending.current = undefined;
      fnRef.current(...args);
    }
  }, []);

  const debounced = useCallback(
    (...args) => {
      pending.current = args;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  return [debounced, flush];
}
