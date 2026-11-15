import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Pencil,
  RotateCcw,
  ScanText,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { OPTION_KEYS, questionFormSchema, toQuestionPayload } from '../../lib/schemas.js';
import { parseQuestionPaper } from '../../lib/paper-parser.js';
import { Alert, Badge, Button, Input, Modal, ProgressBar, Select } from '../../components/ui/index.js';
import { QuestionPreview } from '../../components/domain/QuestionPreview.jsx';
import { QuestionEditor } from './QuestionEditor.jsx';

const MAX_IMPORT = 100;
const ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,image/bmp,image/gif';

let nextId = 1;

/** Parser output plus the chosen defaults, as QuestionEditor form values. */
function toDraft(d, defaults) {
  return {
    id: nextId++,
    number: d.number,
    warnings: d.warnings,
    serverError: null,
    values: {
      type: d.type,
      text: d.text,
      options: d.type === 'single' ? d.options.map((text) => ({ text })) : [{ text: '' }, { text: '' }],
      correctIndex: d.correctIndex,
      answer: d.answer,
      marks: d.marks ?? defaults.marks,
      difficulty: defaults.difficulty,
      topic: defaults.topic,
      explanation: '',
    },
  };
}

/** 'ready' | 'answer' (only the answer is missing) | 'invalid', with the first problem. */
function checkDraft(draft, subject) {
  if (draft.serverError) return { state: 'invalid', message: draft.serverError };
  const result = questionFormSchema.safeParse({ ...draft.values, subject });
  if (result.success) return { state: 'ready' };
  const issues = result.error.issues;
  if (issues.every((i) => ['correctIndex', 'answer'].includes(String(i.path[0]))))
    return { state: 'answer', message: issues[0].message };
  return { state: 'invalid', message: issues[0].message };
}

const STATUS = {
  ready: { tone: 'success', icon: CheckCircle2, label: 'Ready' },
  answer: { tone: 'warn', icon: AlertTriangle, label: 'Needs answer' },
  invalid: { tone: 'danger', icon: XCircle, label: 'Fix needed' },
};

export function ImportPaperModal({ subjects, defaultSubject, topics = [], onClose, onImported }) {
  const [settings, setSettings] = useState({
    subject: defaultSubject || subjects[0]?._id || '',
    marks: 1,
    difficulty: 'medium',
    topic: '',
  });
  const [step, setStep] = useState('upload'); // upload | reading | review
  const [progress, setProgress] = useState(null);
  const [source, setSource] = useState(null); // { fileName, pages, ocrPages, text, skipped }
  const [drafts, setDrafts] = useState([]);
  const [editing, setEditing] = useState(null); // draft id
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const jobRef = useRef(null);

  useEffect(() => () => jobRef.current?.abort(), []);

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));
  const subjectCode = subjects.find((s) => s._id === settings.subject)?.code;
  const checks = useMemo(
    () => new Map(drafts.map((d) => [d.id, checkDraft(d, settings.subject)])),
    [drafts, settings.subject],
  );
  const counts = useMemo(() => {
    const c = { ready: 0, answer: 0, invalid: 0 };
    for (const v of checks.values()) c[v.state]++;
    return c;
  }, [checks]);

  const readFile = async (file) => {
    if (!file) return;
    const job = new AbortController();
    jobRef.current = job;
    setStep('reading');
    setProgress({ page: 1, pages: 1, progress: 0, status: 'Loading the reader' });
    try {
      const { readQuestionPaper } = await import('../../lib/ocr.js');
      const { pages, ocrPages } = await readQuestionPaper(file, {
        onProgress: setProgress,
        signal: job.signal,
      });
      const text = pages.join('\n');
      const parsed = parseQuestionPaper(text);
      const defaults = { ...settings, marks: Number(settings.marks) || 1 };
      setSource({ fileName: file.name, pages: pages.length, ocrPages, text, skipped: parsed.skipped });
      setDrafts(parsed.drafts.map((d) => toDraft(d, defaults)));
      setStep('review');
      if (!parsed.drafts.length) toast.error('No numbered questions were found in this file');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error(err?.message || String(err));
      setStep('upload');
    } finally {
      if (jobRef.current === job) jobRef.current = null;
    }
  };

  const cancelReading = () => {
    jobRef.current?.abort();
    setStep('upload');
  };

  const close = () => {
    jobRef.current?.abort();
    onClose();
  };

  const updateDraft = (id, patch) =>
    setDrafts((list) =>
      list.map((d) => (d.id === id ? { ...d, serverError: null, values: { ...d.values, ...patch } } : d)),
    );
  const removeDraft = (id) => setDrafts((list) => list.filter((d) => d.id !== id));

  const startOver = () => {
    setDrafts([]);
    setSource(null);
    setEditing(null);
    setStep('upload');
  };

  const importAll = async () => {
    setBusy(true);
    try {
      const questions = drafts.map((d) => {
        const { subject: _subject, ...payload } = toQuestionPayload({
          ...d.values,
          subject: settings.subject,
        });
        return payload;
      });
      // A 400 carries per-question errors in `data`, so let it through the success path.
      const result = await api.post(
        '/questions/bulk',
        { subject: settings.subject, questions },
        { validateStatus: (s) => s === 201 || s === 400 },
      );
      if (result?.imported) {
        toast.success(
          `${result.imported} question${result.imported === 1 ? '' : 's'} added to ${subjectCode || 'the bank'}`,
        );
        return onImported();
      }
      if (result?.errors?.length) {
        const byIndex = new Map(result.errors.map((e) => [e.index, e.error]));
        setDrafts((list) => list.map((d, i) => ({ ...d, serverError: byIndex.get(i) || null })));
        toast.error(
          `${result.errors.length} question${result.errors.length === 1 ? ' needs' : 's need'} fixing`,
        );
      } else toast.error('The server rejected the import. Check the questions and try again.');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const editingDraft = drafts.find((d) => d.id === editing);
  if (editingDraft)
    return (
      <Modal
        size="xl"
        title={`Edit question ${editingDraft.number}`}
        description="Changes stay in this import until you import the questions."
        onClose={() => setEditing(null)}
      >
        <QuestionEditor
          subjects={subjects}
          lockSubject
          topics={topics}
          initial={toQuestionPayload({ ...editingDraft.values, subject: settings.subject })}
          submitLabel="Save draft"
          onCancel={() => setEditing(null)}
          onSubmit={(values) => {
            const { subject: _subject, ...rest } = values;
            updateDraft(editingDraft.id, rest);
            setEditing(null);
          }}
        />
      </Modal>
    );

  const canImport =
    step === 'review' && drafts.length > 0 && drafts.length <= MAX_IMPORT && counts.ready === drafts.length;

  return (
    <Modal
      size="xl"
      title="Import a question paper"
      description="Upload a scan, photo or PDF. Questions are read in your browser, then you check them before they are added to the bank."
      onClose={close}
      dismissible={step !== 'reading'}
      footer={
        step === 'review' ? (
          <>
            <Button icon={RotateCcw} variant="ghost" className="mr-auto" onClick={startOver}>
              Another file
            </Button>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={!canImport} loading={busy} onClick={importAll}>
              Import {drafts.length || ''} question{drafts.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : undefined
      }
    >
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Subject"
              required
              value={settings.subject}
              onChange={set('subject')}
              className="sm:col-span-2"
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
            <Input
              label="Default marks"
              type="number"
              step="0.5"
              min="0.5"
              max="10"
              value={settings.marks}
              onChange={set('marks')}
              hint="Used when the paper shows none."
            />
            <Select label="Difficulty" value={settings.difficulty} onChange={set('difficulty')}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Input
              label="Topic"
              list="paper-topics"
              placeholder="Optional"
              value={settings.topic}
              onChange={set('topic')}
              maxLength={80}
            />
            <datalist id="paper-topics">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files?.[0]);
            }}
            disabled={!settings.subject}
            className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-surface-2/50'}`}
          >
            <UploadCloud className="mb-2 h-8 w-8 text-subtle" />
            <p className="font-semibold">Drop a question paper here or click to browse</p>
            <p className="mt-1 text-xs text-muted">
              PDF (up to 10 pages) or a PNG, JPG or WebP photo, under 15 MB.
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <p className="text-xs text-muted">
            Works best with printed papers that number each question (1., Q1, 2a) …) and letter the options
            ((a), b) …). Marks such as [2], (2 marks) or 2M are picked up, and so are answers written as
            &ldquo;Ans: (b)&rdquo; or listed in an answer key.
          </p>
        </div>
      )}

      {step === 'reading' && progress && (
        <div className="mx-auto max-w-md py-10 text-center">
          <ScanText className="mx-auto mb-3 h-9 w-9 animate-pulse text-primary" />
          <p className="font-semibold">{progress.status}…</p>
          <p className="mt-1 text-sm text-muted">
            {progress.pages > 1 ? `Page ${progress.page} of ${progress.pages}, ` : ''}
            {Math.round(progress.progress * 100)}%
          </p>
          <ProgressBar value={Math.round(progress.progress * 100)} className="mt-4" />
          <p className="mt-3 text-xs text-muted">
            The first scan loads the OCR engine (about 4 MB), which can take a few seconds.
          </p>
          <Button className="mt-5" onClick={cancelReading}>
            Cancel
          </Button>
        </div>
      )}

      {step === 'review' && source && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted" />
            <span className="font-medium">{source.fileName}</span>
            <span className="text-muted">
              · {source.pages} page{source.pages === 1 ? '' : 's'}
              {source.ocrPages ? `, ${source.ocrPages} read with OCR` : ', text layer'} · into{' '}
              <b className="font-mono">{subjectCode}</b>
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Badge tone="success">{counts.ready} ready</Badge>
              {counts.answer > 0 && <Badge tone="warn">{counts.answer} need an answer</Badge>}
              {counts.invalid > 0 && <Badge tone="danger">{counts.invalid} to fix</Badge>}
            </div>
          </div>
          {source.ocrPages > 0 && drafts.length > 0 && (
            <Alert tone="info" title="Check the text before importing">
              OCR can misread characters, symbols and code. Question papers rarely include answers, so mark
              the correct option or type the accepted answer for each question. Remove long-answer questions
              that cannot be graded automatically.
            </Alert>
          )}
          {drafts.length > MAX_IMPORT && (
            <Alert tone="danger" title={`At most ${MAX_IMPORT} questions per import`}>
              Remove {drafts.length - MAX_IMPORT} questions, or split the paper into smaller files.
            </Alert>
          )}
          {!drafts.length && (
            <Alert tone="warn" title="No questions found">
              The text below is what was read from the file. Questions must start with a number such as 1., 2)
              or Q3. A clearer scan (flat, well lit, at least 300 dpi) usually helps.
            </Alert>
          )}

          <ul className="space-y-3">
            {drafts.map((d) => {
              const check = checks.get(d.id);
              const status = STATUS[check.state];
              const preview = toQuestionPayload({ ...d.values, subject: settings.subject });
              return (
                <li
                  key={d.id}
                  className={`rounded-xl border bg-surface ${check.state === 'ready' ? 'border-border' : check.state === 'answer' ? 'border-warn/50' : 'border-danger/50'}`}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
                    <span className="rounded-full bg-ink px-2 py-0.5 font-display text-[11px] font-semibold text-ink-fg">
                      Q{d.number}
                    </span>
                    <Badge tone={status.tone}>
                      <status.icon className="h-3.5 w-3.5" /> {status.label}
                    </Badge>
                    {check.state === 'invalid' && <span className="text-danger">{check.message}</span>}
                    <div className="ml-auto flex">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(d.id)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => removeDraft(d.id)}
                        aria-label={`Remove question ${d.number}`}
                        title="Remove"
                      />
                    </div>
                  </div>
                  <div className="p-4">
                    <QuestionPreview question={preview} showAnswer compact />
                    {d.values.type === 'single' ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="mr-1 font-semibold text-muted">Correct option</span>
                        {d.values.options.map((o, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => updateDraft(d.id, { correctIndex: i })}
                            aria-pressed={d.values.correctIndex === i}
                            className={`h-7 w-7 rounded-lg border font-display font-bold transition ${d.values.correctIndex === i ? 'border-success bg-success text-white' : 'border-border text-muted hover:border-primary hover:text-fg'}`}
                          >
                            {OPTION_KEYS[i]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 max-w-sm">
                        <Input
                          label="Accepted answer"
                          placeholder="Type the answer"
                          value={d.values.answer}
                          maxLength={200}
                          onChange={(e) => updateDraft(d.id, { answer: e.target.value })}
                        />
                      </div>
                    )}
                    {d.warnings.length > 0 && (
                      <ul className="mt-3 space-y-0.5 text-xs text-warn">
                        {d.warnings.map((w) => (
                          <li key={w} className="flex gap-1.5">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-muted hover:text-fg">
              Text read from the file
              {source.skipped.length ? ` (${source.skipped.length} header lines skipped)` : ''}
            </summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-mono text-xs text-muted">
              {source.text || '(no text)'}
            </pre>
          </details>
        </div>
      )}
    </Modal>
  );
}
