import { useEffect, useRef } from 'react';

/** Events that mean the student left the exam surface (shown as a blocking warning). */
export const FOCUS_EVENTS = new Set(['TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'DUPLICATE_TAB']);

/** Same-type reports closer than this are dropped on the client (the server also merges). */
export const CLIENT_THROTTLE_MS = 1000;

const BLOCKED_KEYS = new Set(['p', 's', 'u']); // print, save, view-source
const CLIPBOARD_KEYS = new Set(['c', 'v', 'x']);
const DEVTOOLS_KEYS = new Set(['i', 'j', 'c']);

/** Returns the reportable shortcut a keydown represents, or null. Exported for tests. */
export function blockedShortcut(e, policy) {
  const key = (e.key || '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (policy.blockContextMenu) {
    if (key === 'f12') return 'F12';
    if (mod && e.shiftKey && DEVTOOLS_KEYS.has(key)) return `Ctrl+Shift+${key.toUpperCase()}`;
    if (mod && e.altKey && DEVTOOLS_KEYS.has(key)) return `Cmd+Alt+${key.toUpperCase()}`;
    if (mod && BLOCKED_KEYS.has(key)) return `Ctrl+${key.toUpperCase()}`;
    if (key === 'printscreen') return 'PrintScreen';
  }
  if (policy.blockClipboard && mod && !e.shiftKey && CLIPBOARD_KEYS.has(key)) {
    // Allow copy/paste inside the student's own answer box only when clipboard is not blocked.
    return `Ctrl+${key.toUpperCase()}`;
  }
  return null;
}

/** Client-side throttle: true if this type was reported too recently. */
export function createThrottle(windowMs = CLIENT_THROTTLE_MS) {
  const last = new Map();
  return (type, now = Date.now()) => {
    const prev = last.get(type);
    last.set(type, now);
    return prev !== undefined && now - prev < windowMs;
  };
}

/**
 * Browser lockdown for an exam attempt. Every detected event is passed to `report(type, details)`;
 * the server decides whether it counts. Nothing here uses the camera, microphone or screen.
 *
 * Handlers:
 *  - visibilitychange → TAB_HIDDEN
 *  - window blur that is not followed by the page hiding → WINDOW_BLUR
 *  - leaving fullscreen (when required) → FULLSCREEN_EXIT
 *  - copy/cut/paste (blocked when policy.blockClipboard) → COPY/CUT/PASTE
 *  - context menu and shortcuts (blocked when policy.blockContextMenu) → CONTEXT_MENU/SHORTCUT
 *  - the same attempt open in another tab (BroadcastChannel) → DUPLICATE_TAB, `onDuplicate()` on the newer tab
 *  - window/viewport size gap suggesting docked DevTools → DEVTOOLS (logged only)
 *  - going offline → OFFLINE (logged once back online)
 */
export function useProctoring({ active, policy, attemptId, report, onBlocked, onDuplicate }) {
  const reportRef = useRef(report);
  const blockedRef = useRef(onBlocked);
  const duplicateRef = useRef(onDuplicate);
  reportRef.current = report;
  blockedRef.current = onBlocked;
  duplicateRef.current = onDuplicate;

  useEffect(() => {
    if (!active || !policy?.enabled) return;
    const throttled = createThrottle();
    const send = (type, details) => {
      if (!throttled(type)) reportRef.current?.(type, details);
    };
    const cleanups = [];
    const on = (target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      cleanups.push(() => target.removeEventListener(event, handler, options));
    };

    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') send('TAB_HIDDEN');
    });

    // A blur usually precedes visibilitychange on a tab switch; wait briefly so only
    // genuine window switches (alt-tab to another app, clicking another window) report blur.
    let blurTimer;
    on(window, 'blur', () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (document.visibilityState !== 'hidden' && !document.hasFocus()) send('WINDOW_BLUR');
      }, 300);
    });
    cleanups.push(() => clearTimeout(blurTimer));

    if (policy.requireFullscreen)
      on(document, 'fullscreenchange', () => {
        if (!document.fullscreenElement) send('FULLSCREEN_EXIT');
      });

    if (policy.blockClipboard)
      for (const type of ['copy', 'cut', 'paste'])
        on(document, type, (e) => {
          e.preventDefault();
          send(type.toUpperCase());
          blockedRef.current?.(type === 'paste' ? 'Pasting is disabled during this quiz' : 'Copying is disabled during this quiz');
        });

    if (policy.blockContextMenu) {
      on(document, 'contextmenu', (e) => {
        e.preventDefault();
        send('CONTEXT_MENU');
      });
      on(document, 'dragstart', (e) => e.preventDefault());
    }

    on(
      window,
      'keydown',
      (e) => {
        const combo = blockedShortcut(e, policy);
        if (!combo) return;
        e.preventDefault();
        e.stopPropagation();
        send('SHORTCUT', combo);
        blockedRef.current?.(`${combo} is disabled during this quiz`);
      },
      true,
    );

    // Warn before closing or reloading. Progress is saved, but leaving mid-quiz is usually a mistake.
    on(window, 'beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = '';
    });

    let offlineAt = null;
    on(window, 'offline', () => {
      offlineAt = Date.now();
    });
    on(window, 'online', () => {
      if (offlineAt) send('OFFLINE', `${Math.round((Date.now() - offlineAt) / 1000)}s offline`);
      offlineAt = null;
    });

    if (policy.detectDevtools) {
      let lastFlag = 0;
      const id = setInterval(() => {
        if (document.fullscreenElement) return;
        const gap = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 240;
        if (gap && Date.now() - lastFlag > 30_000) {
          lastFlag = Date.now();
          send('DEVTOOLS', 'viewport much smaller than window');
        }
      }, 2000);
      cleanups.push(() => clearInterval(id));
    }

    if (policy.detectDuplicateTab && 'BroadcastChannel' in window && attemptId) {
      const channel = new BroadcastChannel(`exam-attempt-${attemptId}`);
      const tabId = Math.random().toString(36).slice(2);
      channel.onmessage = ({ data }) => {
        if (data?.from === tabId) return;
        if (data?.type === 'hello') channel.postMessage({ type: 'present', from: tabId });
        if (data?.type === 'present') {
          send('DUPLICATE_TAB');
          duplicateRef.current?.();
        }
      };
      channel.postMessage({ type: 'hello', from: tabId });
      cleanups.push(() => channel.close());
    }

    return () => cleanups.forEach((fn) => fn());
  }, [active, policy, attemptId]);
}

/** Requests fullscreen on the document; resolves to true on success. Must run from a user gesture. */
export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* already exited */
  }
}
