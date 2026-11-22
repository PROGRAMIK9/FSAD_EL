import { lazy, Suspense, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Keyboard, Loader2, Play } from 'lucide-react';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor, verdictOf } from '../../lib/code.js';
import { Badge, Button, Spinner, SplitPane } from '../../components/ui/index.js';
import { FontSizeControl, Panel, useCodeFontSize } from '../../components/domain/CodeWorkspace.jsx';

const CodeEditor = lazy(() => import('../../components/domain/CodeEditor.jsx'));

const draftKey = 'playground-draft';
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey) || 'null');
  } catch {
    return null;
  }
}

function OutputBlock({ label, children, tone = '' }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <pre className={`whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-3 font-mono leading-relaxed ${tone}`}>{children}</pre>
    </div>
  );
}

/** Free-form editor: run any program with your own input. Editor | input over output. */
export default function Playground() {
  const saved = readDraft();
  const [language, setLanguage] = useState(saved?.language && LANGUAGES[saved.language] ? saved.language : 'cpp');
  const [source, setSource] = useState(saved?.source ?? starterFor(language));
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [fontSize, setFontSize] = useCodeFontSize();
  const busyRef = useRef(false);
  const uid = useId();

  const save = (lang, src) => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ language: lang, source: src }));
    } catch {
      /* storage unavailable */
    }
  };
  const change = (src) => (setSource(src), save(language, src));
  const switchLanguage = (lang) => {
    setLanguage(lang);
    setSource(starterFor(lang));
    save(lang, starterFor(lang));
  };
  const go = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAnnounce('Running.');
    try {
      const done = await executeCode('run', { language, source, stdin });
      setRun(done);
      const r = done.results?.[0];
      setAnnounce(done.status === 'error' ? 'The run failed.' : `Finished: ${verdictOf(r?.status).label}.`);
    } catch (err) {
      toast.error(String(err).replace(/^Error: /, ''));
      setAnnounce('The run failed.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const r = run?.results?.[0];
  const v = r && verdictOf(r.status);
  const ok = r && (r.status === 'OK' || r.status === 'AC');

  return (
    <section aria-label="Code playground" className="flex flex-col lg:h-[calc(100dvh-6.5rem)] lg:min-h-[34rem]">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Link to="/practice" className="btn btn-ghost btn-sm" aria-label="Back to practice">
          <ArrowLeft /> <span className="hidden sm:inline">Practice</span>
        </Link>
        <h1 className="mr-2 text-lg font-bold tracking-tight">
          Code <span className="accent text-xl">playground</span>
        </h1>
        <select className="input h-8 w-auto rounded-full py-0 pr-8 text-sm" value={language} onChange={(e) => switchLanguage(e.target.value)} aria-label="Language">
          {LANGUAGE_KEYS.map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l].label}
            </option>
          ))}
        </select>
        <FontSizeControl size={fontSize} onChange={setFontSize} />
        <span className="hidden text-xs text-muted md:inline">Nothing here is graded.</span>
        <Button variant="primary" size="sm" icon={busy ? Loader2 : Play} disabled={busy} onClick={go} className={`ml-auto ${busy ? '[&>svg]:animate-spin' : ''}`} aria-keyshortcuts="Control+Enter" title="Run (Ctrl+Enter)">
          Run
        </Button>
      </div>
      <SplitPane
        id="playground"
        className="min-h-0 flex-1 gap-3 lg:gap-0"
        initial={60}
        min={30}
        max={78}
        label="Resize editor and input/output"
        first={
          <Panel className="h-[70vh] lg:h-full">
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
                  fill
                  fontSize={fontSize}
                  className="!rounded-none !border-0"
                  ariaLabel={`${LANGUAGES[language].label} code editor`}
                  describedBy={`${uid}-hint`}
                  onRun={go}
                />
              </Suspense>
            </div>
            <p id={`${uid}-hint`} className="flex items-center gap-1.5 border-t border-border bg-surface-2/50 px-4 py-1.5 text-[11px] text-muted">
              <Keyboard className="h-3.5 w-3.5" aria-hidden />
              <span>
                <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> run · <kbd className="kbd">Esc</kbd> then <kbd className="kbd">Tab</kbd> leaves the editor
              </span>
            </p>
          </Panel>
        }
        second={
          <SplitPane
            id="playground-io"
            direction="vertical"
            className="h-[70vh] lg:h-full"
            initial={35}
            min={15}
            max={80}
            label="Resize input and output"
            first={
              <Panel>
                <label htmlFor={`${uid}-stdin`} className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                  Input <span className="font-normal text-muted">(stdin)</span>
                </label>
                <textarea
                  id={`${uid}-stdin`}
                  className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono outline-none placeholder:text-subtle"
                  style={{ fontSize }}
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  placeholder="Given to your program on stdin"
                  spellCheck={false}
                  data-code-editor
                />
              </Panel>
            }
            second={
              <Panel>
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <span className="text-sm font-semibold">Output</span>
                  {r && !busy && (
                    <>
                      <Badge tone={ok ? 'success' : v.tone} dot>
                        {ok ? 'Finished' : v.label}
                      </Badge>
                      {r.timeMs != null && <span className="text-xs tabular text-muted">{r.timeMs} ms</span>}
                      {r.memoryKb != null && <span className="text-xs tabular text-muted">{Math.round(r.memoryKb / 1024)} MB</span>}
                    </>
                  )}
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 scrollbar-thin" tabIndex={0} aria-label="Program output" style={{ fontSize: Math.max(12, fontSize - 1) }}>
                  {busy ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Spinner className="h-4 w-4" /> Running…
                    </p>
                  ) : run?.status === 'error' ? (
                    <p className="text-sm text-danger">{run.error}</p>
                  ) : r ? (
                    <>
                      <OutputBlock label="Compiler" tone="text-danger">
                        {r.compileOutput}
                      </OutputBlock>
                      <OutputBlock label="stdout">{r.stdout || (r.status === 'CE' ? '' : '(no output)')}</OutputBlock>
                      <OutputBlock label="stderr" tone="text-danger">
                        {r.stderr}
                      </OutputBlock>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Run your program to see its output. <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd>
                    </p>
                  )}
                </div>
              </Panel>
            }
          />
        }
      />
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
    </section>
  );
}
