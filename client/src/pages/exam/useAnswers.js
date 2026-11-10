import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';

const backupKey = (attemptId) => `exam-backup:${attemptId}`;

function readBackup(attemptId) {
  try {
    return JSON.parse(localStorage.getItem(backupKey(attemptId)) || '{}');
  } catch {
    return {};
  }
}

function writeBackup(attemptId, answers) {
  try {
    localStorage.setItem(backupKey(attemptId), JSON.stringify(answers));
  } catch {
    /* storage full or blocked: the server copy still exists */
  }
}

export function clearBackup(attemptId) {
  try {
    localStorage.removeItem(backupKey(attemptId));
  } catch {
    /* ignore */
  }
}

/**
 * Answer state with autosave.
 * - One request in flight per question; newer edits wait and are sent next, so a
 *   slow older request can never overwrite a newer answer on the server.
 * - Text answers are debounced; choices save immediately.
 * - Every change is mirrored to localStorage; unsaved changes are retried every
 *   few seconds and as soon as the browser is back online, including after a reload.
 */
export function useAnswers(attemptId, serverAnswers, { enabled }) {
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState('idle'); // idle | saving | saved | offline | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const pending = useRef(new Map()); // qid -> payload waiting to be sent
  const inflight = useRef(new Set());
  const timers = useRef(new Map());
  const stopped = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Initialise from the server, then re-apply any newer local edits that never reached it.
  useEffect(() => {
    if (!attemptId) return;
    const fromServer = {};
    for (const a of serverAnswers || []) fromServer[String(a.question)] = { value: a.value ?? '', flagged: Boolean(a.flagged), t: a.savedAt ? new Date(a.savedAt).getTime() : 0 };
    const backup = readBackup(attemptId);
    for (const [qid, local] of Object.entries(backup)) {
      if (!fromServer[qid] || (local.t || 0) > (fromServer[qid].t || 0)) {
        fromServer[qid] = local;
        pending.current.set(qid, { question: qid, value: local.value, flagged: local.flagged });
      }
    }
    stopped.current = false;
    setAnswers(fromServer);
  }, [attemptId]);

  const send = useCallback(
    async (qid) => {
      if (stopped.current || inflight.current.has(qid) || !pending.current.has(qid)) return;
      const payload = pending.current.get(qid);
      pending.current.delete(qid);
      inflight.current.add(qid);
      setStatus('saving');
      try {
        await api.patch(`/attempts/${attemptId}/answers`, payload);
        setLastSavedAt(new Date());
      } catch (err) {
        const message = String(err);
        if (/not active|ended|deadline/i.test(message)) stopped.current = true;
        else if (!pending.current.has(qid)) pending.current.set(qid, payload); // keep for retry unless newer exists
        setStatus(navigator.onLine ? (/paused/i.test(message) ? 'saved' : 'error') : 'offline');
      } finally {
        inflight.current.delete(qid);
        if (pending.current.has(qid) && !stopped.current && navigator.onLine) send(qid);
        else if (!pending.current.size && !inflight.current.size) setStatus((s) => (s === 'saving' ? 'saved' : s));
      }
    },
    [attemptId],
  );

  const flushAll = useCallback(async () => {
    for (const [qid, t] of timers.current) {
      clearTimeout(t);
      timers.current.delete(qid);
    }
    await Promise.allSettled([...pending.current.keys()].map((qid) => send(qid)));
    // wait for any requests already in flight
    for (let i = 0; i < 40 && (inflight.current.size || pending.current.size); i++) await new Promise((r) => setTimeout(r, 100));
  }, [send]);

  const update = useCallback(
    (qid, patch, { debounce = 0 } = {}) => {
      if (!enabled) return;
      const next = { ...(answersRef.current[qid] || { value: '', flagged: false }), ...patch, t: Date.now() };
      const all = { ...answersRef.current, [qid]: next };
      setAnswers(all);
      writeBackup(attemptId, all);
      pending.current.set(qid, { question: qid, value: next.value, flagged: next.flagged });
      clearTimeout(timers.current.get(qid));
      if (debounce) {
        setStatus('saving');
        timers.current.set(
          qid,
          setTimeout(() => {
            timers.current.delete(qid);
            send(qid);
          }, debounce),
        );
      } else send(qid);
    },
    [attemptId, enabled, send],
  );

  // Retry loop for anything that failed (offline, server hiccup).
  useEffect(() => {
    if (!attemptId) return;
    const retry = () => {
      if (navigator.onLine) for (const qid of pending.current.keys()) if (!timers.current.has(qid)) send(qid);
    };
    const id = setInterval(retry, 5000);
    const offline = () => setStatus('offline');
    window.addEventListener('online', retry);
    window.addEventListener('offline', offline);
    retry();
    return () => {
      clearInterval(id);
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', offline);
    };
  }, [attemptId, send]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  return { answers, update, flushAll, status, lastSavedAt, hasUnsaved: () => pending.current.size > 0 || inflight.current.size > 0 };
}
