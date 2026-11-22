import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  Cpu,
  EyeOff,
  FlaskConical,
  Loader2,
  Play,
  RotateCcw,
  Send,
  TerminalSquare,
} from 'lucide-react';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor, summarize, verdictOf } from '../../lib/code.js';
import { Badge, Button, Spinner, Tabs } from '../ui/index.js';

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

function Samples({ samples, hiddenCount }) {
  if (!samples?.length) return <p className="text-sm text-muted">No sample tests.</p>;
  return (
    <div className="space-y-3">
      {samples.map((s, i) => (
        <div key={s.index} className="grid gap-3 sm:grid-cols-2">
          <Pre label={`Sample ${i + 1} input`}>{s.input}</Pre>
          <Pre label="Expected output">{s.expectedOutput}</Pre>
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <EyeOff className="h-3.5 w-3.5" /> {hiddenCount} hidden test{hiddenCount === 1 ? '' : 's'} also run
          when you submit.
        </p>
      )}
    </div>
  );
}

/**
 * Editor + tests + run/submit for one coding question. Used by the exam screen (with
 * `attemptId`, autosaving through `onChange`) and by practice.
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
  layout = 'stack',
}) {
  const code = question.code || {};
  const languages = (code.languages?.length ? code.languages : LANGUAGE_KEYS).filter((l) => LANGUAGES[l]);
  const [language, setLanguage] = useState(
    value?.language && languages.includes(value.language) ? value.language : languages[0],
  );
  const [source, setSource] = useState(value?.source ?? starterFor(language, code.starter));
  const drafts = useRef({});
  const [tab, setTab] = useState('tests');
  const [stdin, setStdin] = useState(code.samples?.[0]?.input ?? '');
  const [busy, setBusy] = useState(null); // 'run' | 'submit'
  const [progress, setProgress] = useState(null);
  const [run, setRun] = useState(null);
  const abort = useRef(null);
  const questionId = question._id || question.id;

  useEffect(() => () => abort.current?.abort(), []);

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
    if (!source.trim()) return toast.error('Write some code first');
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(kind);
    setProgress(null);
    setTab('results');
    try {
      const body = { questionId, attemptId, language, source };
      if (kind === 'run' && stdin !== '') body.stdin = stdin;
      const done = await executeCode(kind, body, { onProgress: setProgress, signal: abort.current.signal });
      setRun(done);
      if (kind === 'submit') onSubmitted?.(done);
    } catch (err) {
      if (String(err) !== 'Error: Cancelled') toast.error(String(err).replace(/^Error: /, ''));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const panelTabs = [
    { value: 'tests', label: 'Sample tests', icon: FlaskConical },
    { value: 'input', label: 'Custom input', icon: TerminalSquare },
    { value: 'results', label: 'Results', icon: Cpu },
  ];

  const editor = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto py-1.5 pr-8 text-sm"
          value={language}
          disabled={disabled || busy}
          onChange={(e) => switchLanguage(e.target.value)}
          aria-label="Language"
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l].label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" icon={RotateCcw} disabled={disabled || busy} onClick={reset}>
          Reset
        </Button>
        <span className="ml-auto hidden text-xs text-muted sm:inline">
          {code.timeLimitMs ? `${code.timeLimitMs / 1000}s` : ''}{' '}
          {code.memoryLimitMb ? `· ${code.memoryLimitMb} MB` : ''}
        </span>
      </div>
      <Suspense
        fallback={
          <div className="grid h-72 place-items-center rounded-xl border border-border">
            <Spinner />
          </div>
        }
      >
        <CodeEditor
          value={source}
          onChange={change}
          language={language}
          readOnly={disabled}
          minHeight={layout === 'split' ? '24rem' : '20rem'}
          ariaLabel={`Code for question`}
        />
      </Suspense>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={busy === 'run' ? Loader2 : Play}
          disabled={disabled || Boolean(busy)}
          onClick={() => go('run')}
          className={busy === 'run' ? '[&>svg]:animate-spin' : ''}
        >
          Run
        </Button>
        <Button
          variant="primary"
          icon={busy === 'submit' ? Loader2 : Send}
          disabled={disabled || Boolean(busy)}
          onClick={() => go('submit')}
          className={busy === 'submit' ? '[&>svg]:animate-spin' : ''}
        >
          Submit code
        </Button>
        <span className="text-xs text-muted">
          Run checks public tests{stdin !== '' ? ' and your custom input' : ''}. Submit code checks public
          and hidden tests.
        </span>
      </div>
      <div className="rounded-xl border border-border p-3">
        <Tabs items={panelTabs} value={tab} onChange={setTab} className="mb-3" />
        {tab === 'tests' && <Samples samples={code.samples} hiddenCount={code.hiddenCount} />}
        {tab === 'input' && (
          <div>
            <textarea
              className="input min-h-[96px] resize-y font-mono text-sm"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Input given to your program on stdin"
              spellCheck={false}
              aria-label="Custom input"
              data-code-editor
            />
            <p className="mt-1 text-xs text-muted">
              Run shows your program's output for this input. Clear it to run only the sample tests.
            </p>
          </div>
        )}
        {tab === 'results' &&
          (busy ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-4 w-4" />
              {progress?.status === 'queued' && progress.queuedAhead > 0
                ? `Waiting in line (${progress.queuedAhead} ahead)…`
                : busy === 'submit'
                  ? 'Judging against all tests…'
                  : 'Running…'}
            </p>
          ) : run ? (
            <TestResults run={run} samples={code.samples} />
          ) : (
            <p className="text-sm text-muted">Run your code to see results here.</p>
          ))}
      </div>
    </div>
  );

  if (layout === 'split' && statement)
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">{statement}</div>
        {editor}
      </div>
    );
  return (
    <div className="space-y-5">
      {statement}
      {editor}
    </div>
  );
}
