import { lazy, Suspense, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { EyeOff, FlaskConical, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { LANGUAGES, LANGUAGE_KEYS, executeCode, starterFor } from '../../lib/code.js';
import { Button, Field, Input, Select, Spinner, Switch, Tabs } from '../../components/ui/index.js';
import { TestResults } from '../../components/domain/CodeWorkspace.jsx';

const CodeEditor = lazy(() => import('../../components/domain/CodeEditor.jsx'));
const editorFallback = (
  <div className="grid h-40 place-items-center rounded-xl border border-border">
    <Spinner />
  </div>
);

/** Runs a reference solution against every test of a saved question. */
function ReferenceCheck({ questionId, languages, dirty }) {
  const [language, setLanguage] = useState(languages[0] || 'cpp');
  const [source, setSource] = useState(starterFor(languages[0] || 'cpp'));
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
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Check a reference solution</span>
        <select
          className="input ml-auto w-auto py-1 pr-8 text-sm"
          value={language}
          onChange={(e) => (setLanguage(e.target.value), setSource(starterFor(e.target.value)))}
          aria-label="Reference language"
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l].label}
            </option>
          ))}
        </select>
      </div>
      {dirty && (
        <p className="text-xs text-warn">Save the question first: the check uses the saved test cases.</p>
      )}
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

/** Languages, limits, starter code and test cases of a coding question (inside QuestionEditor). */
export function CodeQuestionFields({ control, register, watch, setValue, errors, questionId, dirty }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'code.testCases' });
  const languages = watch('code.languages') || [];
  const starter = watch('code.starter') || {};
  const practice = watch('code.practice');
  const tests = watch('code.testCases') || [];
  const [starterLang, setStarterLang] = useState(languages[0] || 'cpp');
  const shownStarter = languages.includes(starterLang) ? starterLang : languages[0];
  const e = errors.code || {};

  const toggleLanguage = (l) => {
    const next = languages.includes(l)
      ? languages.filter((x) => x !== l)
      : LANGUAGE_KEYS.filter((k) => k === l || languages.includes(k));
    setValue('code.languages', next, { shouldValidate: true });
  };

  return (
    <div className="space-y-5">
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
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-primary bg-primary-soft text-primary-strong' : 'border-border text-muted hover:text-fg'}`}
              >
                {LANGUAGES[l].label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Time limit (ms)"
          type="number"
          step="100"
          min="500"
          max="10000"
          error={e.timeLimitMs?.message}
          {...register('code.timeLimitMs')}
          hint="Per test. Java gets +2 s, Python +1 s."
        />
        <Input
          label="Memory (MB)"
          type="number"
          min="32"
          max="512"
          error={e.memoryLimitMb?.message}
          {...register('code.memoryLimitMb')}
        />
        <Select label="Output matching" {...register('code.comparison')}>
          <option value="trim">Ignore trailing spaces</option>
          <option value="tokens">Compare words only</option>
          <option value="exact">Exact</option>
        </Select>
      </div>

      <Field
        label="Test cases"
        required
        hint="Marks are shared by weight. Hidden tests are only run on submit; students see whether they passed, not their data."
        error={e.testCases?.message || e.testCases?.root?.message}
      >
        <ul className="space-y-3">
          {fields.map((field, i) => (
            <li
              key={field.id}
              className={`rounded-xl border p-3 ${tests[i]?.hidden ? 'border-dashed border-border' : 'border-border bg-surface-2/40'}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">
                  Test {i + 1}
                  {tests[i]?.hidden ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted">
                      <EyeOff className="h-3 w-3" /> hidden
                    </span>
                  ) : (
                    <span className="ml-2 text-xs font-normal text-muted">sample</span>
                  )}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    className="accent-[rgb(var(--c-primary))]"
                    {...register(`code.testCases.${i}.hidden`)}
                  />{' '}
                  Hidden
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Weight
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    className="input w-16 px-2 py-1 text-xs"
                    {...register(`code.testCases.${i}.weight`)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  disabled={fields.length <= 1}
                  onClick={() => remove(i)}
                  aria-label={`Remove test ${i + 1}`}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <textarea
                  className="input min-h-[72px] resize-y font-mono text-xs"
                  placeholder="Input (stdin)"
                  spellCheck={false}
                  aria-label={`Test ${i + 1} input`}
                  {...register(`code.testCases.${i}.input`)}
                />
                <div>
                  <textarea
                    className="input min-h-[72px] resize-y font-mono text-xs"
                    placeholder="Expected output (stdout)"
                    spellCheck={false}
                    aria-label={`Test ${i + 1} expected output`}
                    aria-invalid={e.testCases?.[i]?.expectedOutput ? 'true' : undefined}
                    {...register(`code.testCases.${i}.expectedOutput`)}
                  />
                  {e.testCases?.[i]?.expectedOutput && (
                    <p className="text-xs text-danger">{e.testCases[i].expectedOutput.message}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {fields.length < 30 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            className="mt-2"
            onClick={() => append({ input: '', expectedOutput: '', weight: 1, hidden: true })}
          >
            Add test case
          </Button>
        )}
      </Field>

      {languages.length > 0 && (
        <Field
          label="Starter code"
          hint="Optional. Shown in the editor when a student starts. Leave empty for the default template."
        >
          <Tabs
            items={languages.map((l) => ({ value: l, label: LANGUAGES[l].label }))}
            value={shownStarter}
            onChange={setStarterLang}
            className="mb-2"
          />
          <Suspense fallback={editorFallback}>
            <CodeEditor
              key={shownStarter}
              value={starter[shownStarter] ?? ''}
              onChange={(src) => setValue(`code.starter.${shownStarter}`, src, { shouldDirty: true })}
              language={shownStarter}
              minHeight="10rem"
            />
          </Suspense>
        </Field>
      )}

      <Switch
        checked={practice}
        onChange={(v) => setValue('code.practice', v, { shouldDirty: true })}
        label="Open for practice"
        description="Enrolled students can solve it in the Practice area, ungraded. Don't use this for questions in an upcoming lab."
      />

      {questionId ? (
        <ReferenceCheck
          questionId={questionId}
          languages={languages.length ? languages : LANGUAGE_KEYS}
          dirty={dirty}
        />
      ) : (
        <p className="text-xs text-muted">
          After saving, you can check a reference solution against every test here.
        </p>
      )}
    </div>
  );
}
