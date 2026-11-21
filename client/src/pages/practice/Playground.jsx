import { lazy, Suspense, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor } from '../../lib/code.js';
import { Button, Card, PageHeader, Spinner } from '../../components/ui/index.js';
import { TestResults } from '../../components/domain/CodeWorkspace.jsx';

const CodeEditor = lazy(() => import('../../components/domain/CodeEditor.jsx'));

const draftKey = 'playground-draft';
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey) || 'null');
  } catch {
    return null;
  }
}

/** Free-form editor: run any program with your own input. */
export default function Playground() {
  const saved = readDraft();
  const [language, setLanguage] = useState(
    saved?.language && LANGUAGES[saved.language] ? saved.language : 'cpp',
  );
  const [source, setSource] = useState(saved?.source ?? starterFor(language));
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);

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
    setBusy(true);
    try {
      setRun(await executeCode('run', { language, source, stdin }));
    } catch (err) {
      toast.error(String(err).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" icon={ArrowLeft} to="/practice" className="mb-4">
        Practice
      </Button>
      <PageHeader
        eyebrow="Coding"
        title="Playground"
        description="Write a program, give it input and see what it prints. Nothing here is graded."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <select
              className="input w-auto py-1.5 pr-8 text-sm"
              value={language}
              onChange={(e) => switchLanguage(e.target.value)}
              aria-label="Language"
            >
              {LANGUAGE_KEYS.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGES[l].label}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              icon={busy ? Loader2 : Play}
              disabled={busy}
              onClick={go}
              className={`ml-auto ${busy ? '[&>svg]:animate-spin' : ''}`}
            >
              Run
            </Button>
          </div>
          <Suspense
            fallback={
              <div className="grid h-96 place-items-center rounded-xl border border-border">
                <Spinner />
              </div>
            }
          >
            <CodeEditor value={source} onChange={change} language={language} minHeight="28rem" />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <label className="label" htmlFor="playground-stdin">
              Input
            </label>
            <textarea
              id="playground-stdin"
              className="input min-h-[120px] resize-y font-mono text-sm"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Given to your program on stdin"
              spellCheck={false}
            />
          </Card>
          <Card className="p-4">
            <p className="label">Output</p>
            {busy ? (
              <Spinner />
            ) : run ? (
              <TestResults run={run} compact />
            ) : (
              <p className="text-sm text-muted">Run your program to see its output.</p>
            )}
            {run?.results?.[0] && !busy && (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-xs">
                {run.results[0].stdout ||
                  run.results[0].stderr ||
                  run.results[0].compileOutput ||
                  '(no output)'}
              </pre>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
