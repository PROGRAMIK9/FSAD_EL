import { lazy, Suspense, useRef, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Braces, EyeOff, FileUp, FlaskConical, Plus, ShieldCheck, Sparkles, TerminalSquare, Trash2, X } from 'lucide-react';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor } from '../../lib/code.js';
import { PARAM_TYPES, RETURN_TYPES, formatSignature, generateFunction } from '../../lib/function-drivers.js';
import { importTestFiles, parseTestsJson } from '../../lib/test-import.js';
import { Alert, Button, Field, Input, Select, Spinner, Switch, Tabs } from '../../components/ui/index.js';
import { TestResults } from '../../components/domain/CodeWorkspace.jsx';

const CodeEditor = lazy(() => import('../../components/domain/CodeEditor.jsx'));
const editorFallback = (
  <div className="grid h-40 place-items-center rounded-xl border border-border">
    <Spinner />
  </div>
);

export const MAX_TESTS = 50;
/** Tests longer than this are shown as a summary instead of an editable box (keeps the form fast). */
const EDITABLE_CHARS = 20_000;
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

/** Runs a reference solution against every test of a saved question. */
function ReferenceCheck({ questionId, languages, starters, dirty }) {
  const [language, setLanguage] = useState(languages[0] || 'cpp');
  const [source, setSource] = useState(starterFor(languages[0] || 'cpp', starters));
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const check = async () => {
    setBusy(true);
    setRun(null);
    try {
      setRun(await executeCode('submit', { questionId, language, source }));
    } catch (err) {
      toast.error(String(err).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Check a reference solution</span>
        <select
          className="input ml-auto w-auto py-1 pr-8 text-sm"
          value={language}
          onChange={(e) => (setLanguage(e.target.value), setSource(starterFor(e.target.value, starters)))}
          aria-label="Reference language"
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l].label}
            </option>
          ))}
        </select>
      </div>
      {dirty && <p className="text-xs text-warn">Save the question first: the check uses the saved test cases and drivers.</p>}
      <Suspense fallback={editorFallback}>
        <CodeEditor value={source} onChange={setSource} language={language} minHeight="12rem" />
      </Suspense>
      <Button size="sm" variant="primary" icon={FlaskConical} loading={busy} onClick={check}>
        Run against all tests
      </Button>
      {run && <TestResults run={run} />}
    </div>
  );
}

/** Function name, parameters and return type for LeetCode-style questions. */
function SignatureBuilder({ signature, onChange, error }) {
  const sig = signature || { name: '', params: [], returns: 'int' };
  const setParam = (i, patch) => onChange({ ...sig, params: sig.params.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <Field label="Function signature" required error={error} hint="Students implement this function. Each test's input has one argument per line in LeetCode notation.">
      <div className="space-y-2 rounded-2xl border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-44 font-mono text-sm" value={sig.name} onChange={(e) => onChange({ ...sig, name: e.target.value.trim() })} placeholder="twoSum" aria-label="Function name" spellCheck={false} />
          <span className="text-sm text-muted">returns</span>
          <select className="input w-auto font-mono text-sm" value={sig.returns} onChange={(e) => onChange({ ...sig, returns: e.target.value })} aria-label="Return type">
            {RETURN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <ul className="space-y-2">
          {sig.params.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-right text-xs text-subtle">{i + 1}.</span>
              <input className="input w-40 font-mono text-sm" value={p.name} onChange={(e) => setParam(i, { name: e.target.value.trim() })} placeholder="nums" aria-label={`Parameter ${i + 1} name`} spellCheck={false} />
              <select className="input w-auto font-mono text-sm" value={p.type} onChange={(e) => setParam(i, { type: e.target.value })} aria-label={`Parameter ${i + 1} type`}>
                {PARAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" icon={X} onClick={() => onChange({ ...sig, params: sig.params.filter((_, j) => j !== i) })} aria-label={`Remove parameter ${i + 1}`} />
            </li>
          ))}
        </ul>
        {sig.params.length < 8 && (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange({ ...sig, params: [...sig.params, { name: '', type: 'int' }] })}>
            Add parameter
          </Button>
        )}
        {sig.name && <p className="font-mono text-xs text-muted">{formatSignature(sig)}</p>}
      </div>
    </Field>
  );
}

/** Reads zip / .in-.out / JSON files (or pasted JSON) and shows what will be imported. */
function TestImporter({ onApply, onClose, existing }) {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState('');
  const [mode, setMode] = useState('replace');
  const [samples, setSamples] = useState(1);

  const read = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      setResult(await importTestFiles([...files]));
    } catch (err) {
      toast.error(`Could not read the files: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };
  const readJson = () => {
    try {
      setResult({ tests: parseTestsJson(json), unpaired: [], ignored: [] });
    } catch (err) {
      toast.error(err.message);
    }
  };
  const tests = result?.tests || [];
  const room = mode === 'append' ? MAX_TESTS - existing : MAX_TESTS;
  const tooBig = tests.filter((t) => t.input.length > 1048576 || t.expectedOutput.length > 1048576);
  const total = tests.reduce((n, t) => n + t.input.length + t.expectedOutput.length, 0);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary-soft/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FileUp className="h-4 w-4 text-primary" /> Import test cases
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label="Close import" />
      </div>
      <p className="text-xs text-muted">
        A HackerRank zip (<code className="font-mono">input/input00.txt</code> + <code className="font-mono">output/output00.txt</code>), files paired by name (<code className="font-mono">1.in</code> / <code className="font-mono">1.out</code>), or JSON{' '}
        <code className="font-mono">{'[{"input": "1 2", "output": "3"}]'}</code>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" multiple accept=".zip,.json,.in,.out,.ans,.txt,.a,.ok" className="hidden" onChange={(e) => read(e.target.files)} data-testid="test-files" />
        <Button size="sm" icon={FileUp} loading={busy} onClick={() => fileRef.current?.click()}>
          Choose files or zip
        </Button>
        <span className="text-xs text-subtle">or paste JSON:</span>
      </div>
      <textarea className="input min-h-[64px] font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder='[{"input": "[2,7,11,15]\n9", "output": "[0,1]"}]' aria-label="Tests as JSON" spellCheck={false} />
      {json.trim() && (
        <Button size="sm" icon={Braces} onClick={readJson}>
          Read JSON
        </Button>
      )}

      {result && (
        <div className="space-y-2 rounded-xl bg-surface p-3">
          <p className="text-sm font-semibold">
            {tests.length} test{tests.length === 1 ? '' : 's'} found <span className="font-normal text-muted">({kb(total)})</span>
          </p>
          {result.unpaired.length > 0 && <Alert tone="warn">No matching input/output for: {result.unpaired.slice(0, 6).join(', ')}{result.unpaired.length > 6 ? '…' : ''}</Alert>}
          {tooBig.length > 0 && <Alert tone="danger">{tooBig.length} test(s) are larger than 1 MB and will be rejected.</Alert>}
          {total > 8 * 1024 * 1024 && <Alert tone="danger">Tests are larger than 8 MB in total.</Alert>}
          {tests.length > room && <Alert tone="warn">Only the first {room} will be imported (at most {MAX_TESTS} per question).</Alert>}
          {tests.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {tests.slice(0, room).map((t, i) => (
                <li key={i} className="flex gap-2 font-mono">
                  <span className="w-16 shrink-0 truncate text-subtle">{t.name}</span>
                  <span className="truncate">{t.input.split('\n')[0].slice(0, 60) || '(empty input)'}</span>
                  <span className="text-subtle">→</span>
                  <span className="truncate">{t.expectedOutput.split('\n')[0].slice(0, 40)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
            <select className="input w-auto py-1 text-sm" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Replace or append">
              <option value="replace">Replace current tests</option>
              <option value="append">Add to current tests</option>
            </select>
            <label className="flex items-center gap-2">
              First
              <input type="number" min="0" max={tests.length} value={samples} onChange={(e) => setSamples(Math.max(0, Number(e.target.value) || 0))} className="input w-16 py-1 text-sm" aria-label="Number of sample tests" />
              as samples, rest hidden
            </label>
            <Button
              size="sm"
              variant="primary"
              disabled={!tests.length || tooBig.length > 0}
              onClick={() =>
                onApply(
                  tests.slice(0, room).map((t, i) => ({ input: t.input, expectedOutput: t.expectedOutput, weight: t.weight ?? 1, hidden: t.hidden ?? i >= samples })),
                  mode,
                )
              }
            >
              Import {Math.min(tests.length, room)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Languages, format, limits, starter code, drivers and test cases of a coding question (inside QuestionEditor). */
export function CodeQuestionFields({ control, register, watch, setValue, errors, questionId, dirty }) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'code.testCases' });
  const languages = watch('code.languages') || [];
  const starter = watch('code.starter') || {};
  const drivers = watch('code.drivers') || {};
  const practice = watch('code.practice');
  const mode = watch('code.mode') || 'stdio';
  const signature = watch('code.signature');
  const tests = watch('code.testCases') || [];
  const [starterLang, setStarterLang] = useState(languages[0] || 'cpp');
  const [driverLang, setDriverLang] = useState(languages[0] || 'cpp');
  const [importing, setImporting] = useState(false);
  const shownStarter = languages.includes(starterLang) ? starterLang : languages[0];
  const shownDriver = languages.includes(driverLang) ? driverLang : languages[0];
  const e = errors.code || {};
  const fn = mode === 'function';

  const toggleLanguage = (l) => {
    const next = languages.includes(l) ? languages.filter((x) => x !== l) : LANGUAGE_KEYS.filter((k) => k === l || languages.includes(k));
    setValue('code.languages', next, { shouldValidate: true });
  };

  const generate = () => {
    try {
      const out = generateFunction(signature);
      const hasDrivers = Object.values(drivers).some(Boolean);
      if (hasDrivers && !window.confirm('Replace the current starter code and drivers with generated ones?')) return;
      setValue('code.starter', out.starter, { shouldDirty: true });
      setValue('code.drivers', out.drivers, { shouldDirty: true, shouldValidate: true });
      toast.success('Starter code and drivers generated for C, C++, Java and Python');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const applyImport = (imported, how) => {
    if (how === 'append') append(imported);
    else replace(imported);
    setImporting(false);
    toast.success(`${imported.length} test case${imported.length === 1 ? '' : 's'} imported`);
  };

  return (
    <div className="space-y-5">
      <Field label="Format">
        <div className="inline-flex flex-wrap gap-2">
          {[
            ['stdio', TerminalSquare, 'Input / output', 'HackerRank style: the program reads stdin and prints'],
            ['function', Braces, 'Function', 'LeetCode style: students write one function'],
          ].map(([value, Icon, label, desc]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setValue('code.mode', value, { shouldDirty: true, shouldValidate: true })}
              className={`flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition ${mode === value ? 'border-ink bg-ink text-ink-fg' : 'border-fg/15 hover:border-fg/40'}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 ${mode === value ? 'text-tile-green' : 'text-muted'}`} />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className={`block text-xs ${mode === value ? 'text-ink-fg/75' : 'text-muted'}`}>{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Languages" required error={e.languages?.message}>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_KEYS.map((l) => {
            const on = languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLanguage(l)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'border-primary bg-primary-soft text-primary-strong' : 'border-border text-muted hover:text-fg'}`}
              >
                {LANGUAGES[l].label}
              </button>
            );
          })}
        </div>
      </Field>

      {fn && (
        <>
          <SignatureBuilder signature={signature} onChange={(sig) => setValue('code.signature', sig, { shouldDirty: true, shouldValidate: true })} error={e.signature?.message} />
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={Sparkles} variant="primary" onClick={generate}>
              Generate starter &amp; drivers
            </Button>
            <span className="text-xs text-muted">
              Inputs: <code className="font-mono">9</code>, <code className="font-mono">2.5</code>, <code className="font-mono">true</code>, <code className="font-mono">"abc"</code>, <code className="font-mono">[2,7,11,15]</code>, <code className="font-mono">[[1,2],[3]]</code>. Outputs use the same notation.
            </span>
          </div>
          {e.drivers?.message && <p className="text-xs text-danger">{e.drivers.message}</p>}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Time limit (ms)" type="number" step="100" min="500" max="10000" error={e.timeLimitMs?.message} {...register('code.timeLimitMs')} hint="Per test. Java gets +2 s, Python +1 s." />
        <Input label="Memory (MB)" type="number" min="32" max="512" error={e.memoryLimitMb?.message} {...register('code.memoryLimitMb')} />
        <Select label="Output matching" {...register('code.comparison')}>
          <option value="trim">Ignore trailing spaces</option>
          <option value="tokens">Compare words only</option>
          <option value="exact">Exact</option>
        </Select>
      </div>

      <Field
        label={`Test cases (${fields.length}/${MAX_TESTS})`}
        required
        hint={
          fn
            ? 'Input: one argument per line, e.g. [2,7,11,15] then 9. Expected output: the return value, e.g. [0,1]. Public cases are checked with Run; hidden cases keep their input and output private and run on Submit code. Marks are shared by weight.'
            : 'Add public cases for students to check with Run. Mark any cases hidden to keep their input and expected output private; hidden cases run on Submit code. Marks are shared by weight.'
        }
        error={e.testCases?.message || e.testCases?.root?.message}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" icon={FileUp} onClick={() => setImporting((v) => !v)} aria-expanded={importing}>
            Import tests
          </Button>
        </div>
        {importing && (
          <div className="mb-3">
            <TestImporter existing={fields.length} onClose={() => setImporting(false)} onApply={applyImport} />
          </div>
        )}
        <ul className="space-y-3">
          {fields.map((field, i) => {
            const t = tests[i] || {};
            const large = (t.input?.length || 0) > EDITABLE_CHARS || (t.expectedOutput?.length || 0) > EDITABLE_CHARS;
            return (
              <li key={field.id} className={`rounded-2xl border p-3 ${t.hidden ? 'border-dashed border-border' : 'border-border bg-surface-2/40'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold">
                    Test {i + 1}
                    {t.hidden ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted">
                        <EyeOff className="h-3 w-3" /> hidden
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-muted">sample</span>
                    )}
                  </span>
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" className="accent-[rgb(var(--c-primary))]" {...register(`code.testCases.${i}.hidden`)} /> Hidden
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    Weight
                    <input type="number" min="0.5" step="0.5" className="input w-16 px-2 py-1 text-xs" {...register(`code.testCases.${i}.weight`)} />
                  </label>
                  <Button size="sm" variant="ghost" icon={Trash2} disabled={fields.length <= 1} onClick={() => remove(i)} aria-label={`Remove test ${i + 1}`} />
                </div>
                {large ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ['Input', t.input],
                      ['Expected output', t.expectedOutput],
                    ].map(([label, text]) => (
                      <div key={label} className="min-w-0 rounded-xl bg-surface-2 p-2.5">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {label} · {kb(text?.length || 0)}
                        </p>
                        <pre className="max-h-24 overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-muted">{(text || '').slice(0, 600)}…</pre>
                      </div>
                    ))}
                    <p className="text-xs text-subtle sm:col-span-2">Large test: shown as a preview. Re-import it to change it.</p>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <textarea
                      className="input min-h-[72px] resize-y font-mono text-xs"
                      placeholder={fn ? 'Arguments, one per line\n[2,7,11,15]\n9' : 'Input (stdin)'}
                      spellCheck={false}
                      aria-label={`Test ${i + 1} input`}
                      {...register(`code.testCases.${i}.input`)}
                    />
                    <div>
                      <textarea
                        className="input min-h-[72px] resize-y font-mono text-xs"
                        placeholder={fn ? 'Return value, e.g. [0,1]' : 'Expected output (stdout)'}
                        spellCheck={false}
                        aria-label={`Test ${i + 1} expected output`}
                        aria-invalid={e.testCases?.[i]?.expectedOutput ? 'true' : undefined}
                        {...register(`code.testCases.${i}.expectedOutput`)}
                      />
                      {e.testCases?.[i]?.expectedOutput && <p className="text-xs text-danger">{e.testCases[i].expectedOutput.message}</p>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {fields.length < MAX_TESTS && (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              className="mt-2"
              onClick={() => append({ input: '', expectedOutput: '', weight: 1, hidden: false })}
            >
              Add public test case
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              className="ml-2 mt-2"
              onClick={() => append({ input: '', expectedOutput: '', weight: 1, hidden: true })}
            >
              Add hidden test case
            </Button>
          </>
        )}
      </Field>

      {languages.length > 0 && (
        <Field label="Starter code" hint={fn ? 'The function stub students start from. Generated from the signature; edit freely.' : 'Optional. Shown in the editor when a student starts. Leave empty for the default template.'}>
          <Tabs items={languages.map((l) => ({ value: l, label: LANGUAGES[l].label }))} value={shownStarter} onChange={setStarterLang} className="mb-2" />
          <Suspense fallback={editorFallback}>
            <CodeEditor key={`starter-${shownStarter}`} value={starter[shownStarter] ?? ''} onChange={(src) => setValue(`code.starter.${shownStarter}`, src, { shouldDirty: true })} language={shownStarter} minHeight="10rem" />
          </Suspense>
        </Field>
      )}

      {fn && languages.length > 0 && (
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              Drivers <span className="rounded-full bg-tile-pink px-2 py-0.5 text-[11px] font-bold text-tile-ink">Hidden from students</span>
            </span>
          }
          hint="The full program per language. The student's code replaces @@USER_CODE@@. Compiler messages count lines of the whole program."
        >
          <Tabs items={languages.map((l) => ({ value: l, label: LANGUAGES[l].label }))} value={shownDriver} onChange={setDriverLang} className="mb-2" />
          <Suspense fallback={editorFallback}>
            <CodeEditor key={`driver-${shownDriver}`} value={drivers[shownDriver] ?? ''} onChange={(src) => setValue(`code.drivers.${shownDriver}`, src, { shouldDirty: true, shouldValidate: true })} language={shownDriver} minHeight="12rem" />
          </Suspense>
        </Field>
      )}

      <Switch checked={practice} onChange={(v) => setValue('code.practice', v, { shouldDirty: true })} label="Open for practice" description="Enrolled students can solve it in the Practice area, ungraded. Don't use this for questions in an upcoming lab." />

      {questionId ? (
        <ReferenceCheck questionId={questionId} languages={languages.length ? languages : LANGUAGE_KEYS} starters={starter} dirty={dirty} />
      ) : (
        <p className="text-xs text-muted">After saving, you can check a reference solution against every test here.</p>
      )}
    </div>
  );
}
