import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Loads `path` with GET and exposes `{ data, loading, error, reload, setData }`.
 * Pass `null` as the path to skip loading (e.g. while a dependency is missing).
 */
export function useApi(path, { initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const result = await api.get(path);
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (id === seq.current) setError(String(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
