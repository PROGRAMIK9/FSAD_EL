import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ChevronDown,
  Cpu,
  EyeOff,
  FlaskConical,
  Keyboard,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Send,
  TerminalSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor, summarize, verdictOf } from '../../lib/code.js';
import { Badge, Button, Spinner, SplitPane } from '../ui/index.js';
import { formatSignature } from '../../lib/function-drivers.js';

const CodeEditor = lazy(() => import('./CodeEditor.jsx'));

function Pre({ label, children, tone = '' }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <pre
        className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2.5 font-mono text-xs leading-relaxed ${tone}`}
      >
        {children || <span className="text-subtle">(empty)</span>}
      </pre>
    </div>
  );
}

/** Per-test verdicts of a run, with output for the tests the viewer may see. */
export function TestResults({ run, samples = [], compact = false }) {
  const [open, setOpen] = useState(null);
  if (!run) return null;
  const summary = summarize(run);
  const ce = run.results?.find((r) => r.status === 'CE' && r.compileOutput);
  const sampleOf = new Map(samples.map((s) => [s.index, s]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={summary.tone} dot>
          {summary.text}
        </Badge>
        {run.score != null && run.totalWeight > 0 && (
          <span className="text-xs text-muted">Score {run.score}</span>
        )}
      </div>
      {ce && (
        <Pre label="Compiler output" tone="text-danger">
          {ce.compileOutput}
        </Pre>
      )}
      {run.status === 'error' && <p className="text-sm text-danger">{run.error}</p>}
      <ul className="space-y-1.5">
        {(run.results || []).map((r, i) => {
          const v = verdictOf(r.status);
          const sample = sampleOf.get(r.index);
          const name = r.custom
            ? 'Custom input'
            : r.hidden
              ? `Hidden test ${r.index + 1}`
              : `Test ${r.index + 1}`;
          const canOpen = !compact && (r.stdout !== undefined || r.stderr);
          const isOpen = open === i;
          return (
            <li key={i} className="rounded-lg border border-border">
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-default"
              >
                {r.hidden ? (
                  <EyeOff className="h-3.5 w-3.5 text-subtle" aria-hidden />
                ) : r.custom ? (
                  <TerminalSquare className="h-3.5 w-3.5 text-subtle" aria-hidden />
                ) : (
                  <FlaskConical className="h-3.5 w-3.5 text-subtle" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                {r.timeMs != null && <span className="text-xs tabular text-muted">{r.timeMs} ms</span>}
                {r.memoryKb != null && (
                  <span className="hidden text-xs tabular text-muted sm:inline">
                    {Math.round(r.memoryKb / 1024)} MB
                  </span>
                )}
                <Badge tone={r.custom && r.status === 'OK' ? 'primary' : v.tone}>
                  {r.custom && r.status === 'OK' ? 'Ran' : v.label}
                </Badge>
                {canOpen && (
                  <ChevronDown
                    className={`h-4 w-4 text-subtle transition ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                )}
              </button>
              {isOpen && (
                <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
                  {sample && <Pre label="Input">{sample.input}</Pre>}
                  {sample && <Pre label="Expected output">{sample.expectedOutput}</Pre>}
                  <Pre label="Your output">{r.stdout}</Pre>
                  {r.stderr && (
                    <Pre label="Errors" tone="text-danger">
                      {r.stderr}
                    </Pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Editor font size, remembered on this device. */
export function useCodeFontSize() {
  const [size, setSize] = useState(() => {
    try {
      return Math.min(24, Math.max(11, Number(localStorage.getItem('code-font-size')) || 14));
    } catch {
      return 14;
    }
  });
  const set = (n) => {
    const v = Math.min(24, Math.max(11, n));
    setSize(v);
    try {
      localStorage.setItem('code-font-size', String(v));
    } catch {
      /* storage unavailable */
    }
  };
  return [size, set];
}

/** Toolbar buttons that change the editor font size. */
export function FontSizeControl({ size, onChange }) {
  return (
    <div className="flex items-center rounded-full border border-fg/15" role="group" aria-label="Editor font size">
      <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(size - 1)} disabled={size <= 11} aria-label="Smaller code font">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-xs font-semibold tabular" aria-live="polite" aria-label={`Font size ${size}`}>
        {size}
      </span>
      <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(size + 1)} disabled={size >= 24} aria-label="Larger code font">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Fills the space with a panel that scrolls on its own. */
export const Panel = ({ children, className = '', ...props }) => (
  <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface ${className}`} {...props}>
    {children}
  </div>
);

const SHORTCUT_HINT = 'Ctrl+Enter runs, Ctrl+Shift+Enter submits. Press Escape, then Tab, to move out of the editor.';

function CaseTabs({ samples, hiddenCount }) {
  const [i, setI] = useState(0);
  if (!samples?.length) return <p className="text-sm text-muted">No sample tests.</p>;
  const s = samples[Math.min(i, samples.length - 1)];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sample cases">
        {samples.map((c, n) => (
          <button
            key={c.index}
            type="button"
            role="tab"
            aria-selected={n === i}
            onClick={() => setI(n)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${n === i ? 'border-ink bg-ink text-ink-fg' : 'border-fg/15 text-muted hover:text-fg'}`}
          >
            Case {n + 1}
          </button>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Pre label="Input">{s.input}</Pre>
        <Pre label="Expected output">{s.expectedOutput}</Pre>
      </div>
      {hiddenCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <EyeOff className="h-3.5 w-3.5" /> {hiddenCount} hidden test{hiddenCount === 1 ? '' : 's'} also run when you submit.
        </p>
      )}
    </div>
  );
}

/** Problem statement pane: text, function to implement, examples and limits. */
function ProblemPane({ question, statement, code }) {
  return (
    <Panel>
      <div className="min-h-0 flex-1 overflow-auto p-5 scrollbar-thin" tabIndex={0} aria-label="Problem statement">
        {statement || <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{question.text}</p>}
        {code.mode === 'function' && code.signature?.name && (
          <div className="mt-5 rounded-2xl bg-tile-lime px-4 py-3 text-sm text-tile-ink">
            <p className="font-semibold">Implement</p>
            <code className="mt-1 block break-words font-mono text-[13px] font-semibold">{formatSignature(code.signature)}</code>
            <p className="mt-1 text-xs text-tile-ink/75">Write only the function, inside class Solution where the starter has one. Each test passes the arguments; your return value is compared.</p>
          </div>
        )}
        {code.samples?.length > 0 && (
          <div className="mt-6 space-y-4">
            {code.samples.map((s, n) => (
              <div key={s.index}>
                <p className="mb-1.5 text-sm font-bold">Example {n + 1}</p>
                <div className="space-y-2 rounded-2xl border-l-4 border-tile-lavender bg-surface-2/60 p-3 font-mono text-[13px]">
                  <p className="whitespace-pre-wrap break-words">
                    <span className="font-sans text-xs font-semibold text-muted">Input </span>
                    {'\n'}
                    {s.input || '(empty)'}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    <span className="font-sans text-xs font-semibold text-muted">Output </span>
                    {'\n'}
                    {s.expectedOutput}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-xs text-muted">
          {code.timeLimitMs ? (
            <div>
              <dt className="inline">Time limit </dt>
              <dd className="inline font-semibold text-fg">{code.timeLimitMs / 1000} s</dd>
            </div>
          ) : null}
          {code.memoryLimitMb ? (
            <div>
              <dt className="inline">Memory </dt>
              <dd className="inline font-semibold text-fg">{code.memoryLimitMb} MB</dd>
            </div>
          ) : null}
          {code.hiddenCount > 0 && (
            <div>
              <dt className="inline">Hidden tests </dt>
              <dd className="inline font-semibold text-fg">{code.hiddenCount}</dd>
            </div>
          )}
        </dl>
      </div>
    </Panel>
  );
}

/**
 * IDE-style workspace for one coding question: problem | editor over console, with draggable
 * (and keyboard-resizable) dividers, focus mode, font size, Ctrl+Enter / Ctrl+Shift+Enter, and a
 * live region that announces run results. Used by practice (with `backTo`) and the exam screen
 * (with `attemptId`, autosaving through `onChange`; focus mode off because the exam is fullscreen).
 *
 * value: { language, source } | null
 */
export function CodeWorkspace({
  question,
  value,
  onChange,
  attemptId,
  disabled = false,
  onSubmitted,
  statement = null,
  title,
  backTo,
  allowFocusMode = true,
  height = 'calc(100dvh - 8.5rem)',
}) {
  const code = question.code || {};
  const languages = (code.languages?.length ? code.languages : LANGUAGE_KEYS).filter((l) => LANGUAGES[l]);
  const [language, setLanguage] = useState(value?.language && languages.includes(value.language) ? value.language : languages[0]);
  const [source, setSource] = useState(value?.source ?? starterFor(language, code.starter));
  const drafts = useRef({});
  const [tab, setTab] = useState('tests');
  const [stdin, setStdin] = useState(code.samples?.[0]?.input ?? '');
  const [busy, setBusy] = useState(null); // 'run' | 'submit'
  const [progress, setProgress] = useState(null);
  const [run, setRun] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [focus, setFocus] = useState(false);
  const [fontSize, setFontSize] = useCodeFontSize();
  const abort = useRef(null);
  const busyRef = useRef(null);
  busyRef.current = busy;
  const questionId = question._id || question.id;
  const uid = useId();
  const hintId = `${uid}-hint`;
  const consoleId = `${uid}-console`;

  useEffect(() => () => abort.current?.abort(), []);
  // Focus mode covers the page; lock the page scroll and leave it with Escape (outside the editor).
  useEffect(() => {
    if (!focus) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.target.closest?.('.cm-editor')) setFocus(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [focus]);

  const change = (next) => {
    setSource(next);
    onChange?.({ language, source: next });
  };

  const switchLanguage = (next) => {
    drafts.current[language] = source;
    const body = drafts.current[next] ?? starterFor(next, code.starter);
    setLanguage(next);
    setSource(body);
    onChange?.({ language: next, source: body });
  };

  const reset = () => {
    if (!window.confirm('Replace your code with the starter code?')) return;
    change(starterFor(language, code.starter));
  };

  const go = async (kind) => {
    if (disabled || busyRef.current) return;
    if (!source.trim()) return toast.error('Write some code first');
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(kind);
    setProgress(null);
    setTab('results');
    setAnnounce(kind === 'submit' ? 'Submitting: judging against every test.' : 'Running the sample tests.');
    try {
      const body = { questionId, attemptId, language, source };
      if (kind === 'run' && stdin !== '') body.stdin = stdin;
      const done = await executeCode(kind, body, { onProgress: setProgress, signal: abort.current.signal });
      setRun(done);
      setAnnounce(`${kind === 'submit' ? 'Submission' : 'Run'} finished: ${summarize(done)?.text || done.status}.`);
      if (kind === 'submit') onSubmitted?.(done);
    } catch (err) {
      if (String(err) !== 'Error: Cancelled') {
        toast.error(String(err).replace(/^Error: /, ''));
        setAnnounce('The run failed.');
      }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const consoleTabs = [
    { value: 'tests', label: 'Test cases', icon: FlaskConical },
    { value: 'input', label: 'Custom input', icon: TerminalSquare },
    { value: 'results', label: 'Results', icon: Cpu },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      {backTo && (
        <Link to={backTo} className="btn btn-ghost btn-sm" aria-label="Back to practice">
          <ArrowLeft /> <span className="hidden sm:inline">Practice</span>
        </Link>
      )}
      {title && <h1 className="mr-2 min-w-0 max-w-[40ch] truncate text-base font-bold tracking-tight sm:text-lg">{title}</h1>}
      <select className="input h-8 w-auto rounded-full py-0 pr-8 text-sm" value={language} disabled={disabled || Boolean(busy)} onChange={(e) => switchLanguage(e.target.value)} aria-label="Language">
        {languages.map((l) => (
          <option key={l} value={l}>
            {LANGUAGES[l].label}
          </option>
        ))}
      </select>
      <Button size="sm" variant="ghost" icon={RotateCcw} disabled={disabled || Boolean(busy)} onClick={reset} title="Replace your code with the starter code">
        <span className="hidden md:inline">Reset</span>
      </Button>
      <FontSizeControl size={fontSize} onChange={setFontSize} />
      {allowFocusMode && (
        <Button size="sm" variant="ghost" icon={focus ? Minimize2 : Maximize2} onClick={() => setFocus((f) => !f)} aria-pressed={focus} title={focus ? 'Exit focus mode (Esc)' : 'Focus mode: hide everything else'}>
          <span className="hidden md:inline">{focus ? 'Exit focus' : 'Focus'}</span>
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          icon={busy === 'run' ? Loader2 : Play}
          disabled={disabled || Boolean(busy)}
          onClick={() => go('run')}
          className={busy === 'run' ? '[&>svg]:animate-spin' : ''}
          aria-keyshortcuts="Control+Enter"
          title="Run the public tests (Ctrl+Enter)"
        >
          Run
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={busy === 'submit' ? Loader2 : Send}
          disabled={disabled || Boolean(busy)}
          onClick={() => go('submit')}
          className={busy === 'submit' ? '[&>svg]:animate-spin' : ''}
          aria-keyshortcuts="Control+Shift+Enter"
          title="Judge against public and hidden tests (Ctrl+Shift+Enter)"
        >
          Submit code
        </Button>
      </div>
    </div>
  );

  const editorPane = (
    <Panel className="!rounded-3xl">
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center">
              <Spinner />
            </div>
          }
        >
          <CodeEditor
            value={source}
            onChange={change}
            language={language}
            readOnly={disabled}
            fill
            fontSize={fontSize}
            className="!rounded-none !border-0"
            ariaLabel={`${LANGUAGES[language]?.label || ''} code editor${title ? ` for ${title}` : ''}`}
            describedBy={hintId}
            onRun={() => go('run')}
            onSubmit={() => go('submit')}
          />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2/50 px-4 py-1.5 text-[11px] text-muted">
        <span className="font-semibold text-fg">{LANGUAGES[language]?.label}</span>
        <span id={hintId} className="flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5" aria-hidden />
          <span>
            <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> run · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Shift</kbd>+<kbd className="kbd">Enter</kbd> submit · <kbd className="kbd">Esc</kbd> then{' '}
            <kbd className="kbd">Tab</kbd> leaves the editor
          </span>
          <span className="sr-only">{SHORTCUT_HINT}</span>
        </span>
      </div>
    </Panel>
  );

  const consolePane = (
    <Panel>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2" role="tablist" aria-label="Console">
        {consoleTabs.map(({ value: v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`${consoleId}-${v}`}
            aria-selected={tab === v}
            aria-controls={`${consoleId}-panel`}
            onClick={() => setTab(v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${tab === v ? 'bg-ink text-ink-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
          >
            <Icon className={`h-4 w-4 ${tab === v ? 'text-tile-green' : ''}`} aria-hidden />
            {label}
          </button>
        ))}
        {run && !busy && tab !== 'results' && (
          <span className="ml-auto shrink-0">
            <Badge tone={summarize(run).tone} dot>
              {summarize(run).text}
            </Badge>
          </span>
        )}
      </div>
      <div id={`${consoleId}-panel`} role="tabpanel" aria-labelledby={`${consoleId}-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
        {tab === 'tests' && <CaseTabs samples={code.samples} hiddenCount={code.hiddenCount} />}
        {tab === 'input' && (
          <div className="flex h-full min-h-[8rem] flex-col">
            <label className="label" htmlFor={`${uid}-stdin`}>
              Custom input <span className="font-normal text-muted">(stdin)</span>
            </label>
            <textarea
              id={`${uid}-stdin`}
              className="input min-h-[6rem] flex-1 resize-none font-mono text-sm"
              style={{ fontSize }}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Input given to your program"
              spellCheck={false}
              data-code-editor
            />
            <p className="mt-1.5 text-xs text-muted">Run also shows your program's output for this input. Clear it to run only the sample tests.</p>
          </div>
        )}
        {tab === 'results' &&
          (busy ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-4 w-4" />
              {progress?.status === 'queued' && progress.queuedAhead > 0 ? `Waiting in line (${progress.queuedAhead} ahead)…` : busy === 'submit' ? 'Judging against every test…' : 'Running…'}
            </p>
          ) : run ? (
            <TestResults run={run} samples={code.samples} />
          ) : (
            <p className="text-sm text-muted">
              Run your code to see results here. <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd>
            </p>
          ))}
      </div>
    </Panel>
  );

  return (
    <section
      aria-label="Coding workspace"
      className={focus ? 'fixed inset-0 z-50 flex flex-col bg-bg p-3 sm:p-4' : 'flex flex-col lg:h-[var(--ws-h)] lg:min-h-[34rem]'}
      style={focus ? undefined : { '--ws-h': height }}
    >
      {toolbar}
      <SplitPane
        id="ws-main"
        className="min-h-0 flex-1 gap-3 lg:gap-0"
        initial={40}
        min={22}
        max={70}
        label="Resize problem and editor"
        first={
          <div className="h-[55vh] lg:h-full">
            <ProblemPane question={question} statement={statement} code={code} />
          </div>
        }
        second={
          <SplitPane
            id="ws-editor"
            direction="vertical"
            className="h-[85vh] lg:h-full"
            initial={62}
            min={25}
            max={85}
            label="Resize editor and console"
            first={editorPane}
            second={consolePane}
          />
        }
      />
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
    </section>
  );
}
