import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ClipboardList,
  DoorOpen,
  Maximize,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { QUIZ_MARKS, proctoringDefaults, proctoringPresets, quizFormSchema, suggestQuestions, sumMarks } from '../../lib/schemas.js';
import { fmtDateTime, toLocalInput } from '../../lib/format.js';
import { Alert, Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Ring, Select, Skeleton, Stepper, Switch, Textarea } from '../../components/ui/index.js';
import { QuestionPreview } from '../../components/domain/QuestionPreview.jsx';
import { QuizCard } from '../../components/domain/QuizCard.jsx';
import { PageLoader } from '../../components/layout/PageLoader.jsx';
import { QuestionEditor } from '../questions/QuestionEditor.jsx';

const STEPS = [
  { label: 'Details', description: 'Subject and title', fields: ['subject', 'title', 'description'] },
  { label: 'Questions', description: 'Exactly 10 marks', fields: ['questionIds'] },
  { label: 'Schedule', description: 'When and how long', fields: ['availabilityMode', 'startsAt', 'endsAt', 'durationMinutes', 'attemptsAllowed'] },
  { label: 'Proctoring', description: 'Exam environment', fields: ['proctoring'] },
  { label: 'Review', description: 'Check and publish', fields: [] },
];

const MODES = [
  { value: 'scheduled', icon: CalendarClock, title: 'Scheduled', text: 'Opens automatically at a set time.' },
  { value: 'instant', icon: Zap, title: 'Open on publish', text: 'Students can start as soon as you publish.' },
  { value: 'room', icon: DoorOpen, title: 'Live room', text: 'Students join with a code; you start everyone together.' },
];

const DURATIONS = [10, 15, 20, 30, 45, 60];

const emptyQuiz = {
  subject: '',
  title: '',
  description: '',
  questionIds: [],
  availabilityMode: 'scheduled',
  startsAt: '',
  endsAt: '',
  durationMinutes: 20,
  cieSlot: '',
  attemptsAllowed: 1,
  randomizeQuestions: true,
  randomizeOptions: true,
  proctoring: proctoringDefaults,
};

function fromAssessment(a) {
  return {
    subject: String(a.subject?._id || a.subject),
    title: a.title,
    description: a.description || '',
    questionIds: (a.questionIds || []).map((q) => String(q._id || q)),
    availabilityMode: a.availabilityMode,
    startsAt: toLocalInput(a.startsAt),
    endsAt: toLocalInput(a.endsAt),
    durationMinutes: a.durationMinutes,
    attemptsAllowed: a.attemptsAllowed,
    cieSlot: a.cieSlot || '',
    randomizeQuestions: Boolean(a.randomizeQuestions),
    randomizeOptions: Boolean(a.randomizeOptions),
    proctoring: { ...proctoringDefaults, ...(a.proctoring || {}) },
  };
}

function toPayload(v) {
  return {
    ...v,
    startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null,
    endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
    durationMinutes: Number(v.durationMinutes),
    attemptsAllowed: Number(v.attemptsAllowed),
    cieSlot: v.cieSlot || null,
    proctoring: { ...v.proctoring, maxViolations: Number(v.proctoring.maxViolations) },
    maxMarks: QUIZ_MARKS,
  };
}

function MarksMeter({ total }) {
  const done = total === QUIZ_MARKS;
  const over = total > QUIZ_MARKS;
  return (
    <div className={`flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset ${done ? 'bg-success-soft/60 ring-success/30' : over ? 'bg-danger-soft/60 ring-danger/30' : 'bg-surface-2/60 ring-border'}`}>
      <Ring value={Math.min(total, QUIZ_MARKS)} max={QUIZ_MARKS} size={64} stroke={7} color={`rgb(var(--c-${done ? 'success' : over ? 'danger' : 'primary'}))`} label={`${total} of ${QUIZ_MARKS} marks`}>
        <span className={`font-display text-base font-bold tabular ${done ? 'text-success' : over ? 'text-danger' : 'text-fg'}`}>{total}</span>
      </Ring>
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold">
          Total marks <span className="text-muted">/ {QUIZ_MARKS}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{done ? 'Ready. Quizzes are always worth exactly 10 marks.' : over ? `Remove ${total - QUIZ_MARKS} mark(s) to continue.` : `Add ${QUIZ_MARKS - total} more mark(s) to continue.`}</p>
      </div>
    </div>
  );
}

function QuestionsStep({ subject, subjects, selectedIds, setSelectedIds, bank, reloadBank, loading }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);
  const byId = useMemo(() => new Map(bank.map((q) => [String(q._id), q])), [bank]);
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean);
  const total = sumMarks(selected);
  const available = bank.filter((q) => !selectedIds.includes(String(q._id)) && (!type || q.type === type) && `${q.text} ${q.topic || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id) => setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const move = (i, d) => {
    const next = [...selectedIds];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSelectedIds(next);
  };
  const suggest = () => {
    const pool = bank.filter((q) => !selectedIds.includes(String(q._id)));
    const ids = suggestQuestions(pool, QUIZ_MARKS - total);
    if (!ids) return toast.error('No combination of remaining questions adds up exactly. Add a question with the missing marks.');
    setSelectedIds([...selectedIds, ...ids.map(String)]);
    toast.success(`Added ${ids.length} question${ids.length === 1 ? '' : 's'} to reach 10 marks`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-9" placeholder="Search the bank" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="single">Multiple choice</option>
            <option value="fill_blank">Fill in</option>
          </select>
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New question
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : available.length ? (
            <ul className="divide-y divide-border">
              {available.map((q) => (
                <li key={q._id}>
                  <button type="button" onClick={() => toggle(String(q._id))} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-border text-transparent">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium text-fg">{q.text}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                        <Badge tone="primary">{q.type === 'single' ? 'MCQ' : 'Fill in'}</Badge>
                        <Badge>{q.difficulty}</Badge>
                        {q.topic && <span>{q.topic}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-sm font-bold text-primary">{q.marks}m</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={bank.length ? (selectedIds.length === bank.length ? 'Every question is selected' : 'No questions match') : 'This subject has no questions yet'}
              description={bank.length ? undefined : 'Create questions here; they are saved to the question bank for reuse.'}
              action={
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  New question
                </Button>
              }
            />
          )}
        </div>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <MarksMeter total={total} />
        {total < QUIZ_MARKS && bank.length > selected.length && (
          <Button className="w-full" icon={Sparkles} onClick={suggest}>
            Suggest questions to reach 10
          </Button>
        )}
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Paper order</p>
            <span className="text-xs text-muted">{selected.length} questions</span>
          </div>
          {selected.length ? (
            <ol className="max-h-[40vh] divide-y divide-border overflow-y-auto scrollbar-thin">
              {selected.map((q, i) => (
                <li key={q._id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{q.text}</span>
                  <span className="text-xs font-semibold text-primary">{q.marks}m</span>
                  <div className="flex">
                    <Button size="sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
                    <Button size="sm" variant="ghost" icon={ArrowDown} disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
                    <Button size="sm" variant="ghost" icon={X} onClick={() => toggle(String(q._id))} aria-label="Remove" />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted">Pick questions from the bank on the left.</p>
          )}
        </Card>
      </div>

      <Drawer open={creating} onClose={() => setCreating(false)} title="New question" description={`Saved to the ${subjects.find((s) => s._id === subject)?.code || ''} question bank and added to this quiz.`} width="max-w-3xl">
        <QuestionEditor
          subjects={subjects}
          defaultSubject={subject}
          lockSubject
          onCancel={() => setCreating(false)}
          onSaved={async (q) => {
            setCreating(false);
            await reloadBank();
            setSelectedIds([...selectedIds, String(q._id)]);
          }}
        />
      </Drawer>
    </div>
  );
}

function ModeCard({ mode, active, onSelect }) {
  const Icon = mode.icon;
  return (
    <button type="button" onClick={onSelect} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${active ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border hover:border-primary/40 hover:bg-surface-2/40'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted'}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block font-semibold text-fg">{mode.title}</span>
        <span className="mt-0.5 block text-xs text-muted">{mode.text}</span>
      </span>
    </button>
  );
}

function ProctoringStep({ value, onChange, errors }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const preset = Object.entries(proctoringPresets).find(([, p]) => Object.entries(p.values).every(([k, v]) => value[k] === v))?.[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card className="p-5">
        <Switch label="Proctored exam environment" description="Monitors the browser while students take the quiz. No camera or microphone is used." checked={value.enabled} onChange={(enabled) => set({ enabled })} />
        {value.enabled && (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {Object.entries(proctoringPresets).map(([key, p]) => (
                <button key={key} type="button" onClick={() => onChange({ ...p.values })} className={`rounded-lg border p-3 text-left transition ${preset === key ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2/50'}`}>
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{p.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 divide-y divide-border rounded-xl border border-border">
              <div className="p-4">
                <Switch label="Require fullscreen" description="Students enter fullscreen to begin; leaving it counts as a warning." checked={value.requireFullscreen} onChange={(requireFullscreen) => set({ requireFullscreen })} />
              </div>
              <div className="p-4">
                <Switch label="Block copy, cut and paste" description="Clipboard use is blocked and logged." checked={value.blockClipboard} onChange={(blockClipboard) => set({ blockClipboard })} />
              </div>
              <div className="p-4">
                <Switch label="Block right-click and shortcuts" description="Disables the context menu, print, save, view-source and DevTools shortcuts." checked={value.blockContextMenu} onChange={(blockContextMenu) => set({ blockContextMenu })} />
              </div>
              <div className="p-4">
                <Switch label="Detect a second tab" description="Opening the same attempt in another tab or window counts as a warning." checked={value.detectDuplicateTab} onChange={(detectDuplicateTab) => set({ detectDuplicateTab })} />
              </div>
              <div className="p-4">
                <Switch label="Flag possible DevTools" description="Heuristic only. Logged for review, never counted as a warning." checked={value.detectDevtools} onChange={(detectDevtools) => set({ detectDevtools })} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium">Auto-submit after</p>
                  <p className="text-xs text-muted">Warnings (tab switch, fullscreen exit, second tab…) before the attempt is submitted. 0 = never.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={20} className="input w-20 text-center" value={value.maxViolations} onChange={(e) => set({ maxViolations: e.target.value === '' ? '' : Number(e.target.value) })} aria-label="Warnings before auto-submit" aria-invalid={errors?.maxViolations ? 'true' : undefined} />
                  <span className="text-sm text-muted">warnings</span>
                </div>
                {errors?.maxViolations && <p className="w-full text-xs text-danger">{errors.maxViolations.message}</p>}
              </div>
            </div>
          </>
        )}
      </Card>
      <Card className="h-fit p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> What students will see
        </p>
        <ul className="space-y-2.5 text-sm text-muted">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> A rules screen they must accept before starting.
          </li>
          {value.enabled && value.requireFullscreen && (
            <li className="flex gap-2">
              <Maximize className="mt-0.5 h-4 w-4 shrink-0 text-success" /> The quiz opens in fullscreen.
            </li>
          )}
          {value.enabled && (
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> A blocking warning each time they leave the quiz, with warnings remaining.
            </li>
          )}
          {value.enabled && Number(value.maxViolations) > 0 && (
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Automatic submission at warning {value.maxViolations}.
            </li>
          )}
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> You see every event live on the monitor page.
          </li>
        </ul>
      </Card>
    </div>
  );
}

/** The quiz as a student's card would show it, for the review step. */
const previewQuiz = (values, subject, questionCount) => ({
  _id: 'preview',
  title: values.title || 'Untitled quiz',
  subject: subject ? { code: subject.code, name: subject.name } : undefined,
  questionCount,
  maxMarks: QUIZ_MARKS,
  durationMinutes: values.durationMinutes,
  proctoring: values.proctoring,
  availabilityMode: values.availabilityMode,
  state: values.availabilityMode === 'room' ? 'SCHEDULED' : 'AVAILABLE',
  attemptsAllowed: values.attemptsAllowed,
  endsAt: values.endsAt,
  myAttempts: {},
});

function ReviewStep({ values, subject, questions }) {
  const mode = MODES.find((m) => m.value === values.availabilityMode);
  const p = values.proctoring;
  const rows = [
    ['Subject', subject ? `${subject.code} · ${subject.name}` : '—'],
    ['Availability', mode?.title],
    ['Opens', values.startsAt ? fmtDateTime(values.startsAt) : values.availabilityMode === 'instant' ? 'When published' : '—'],
    ['Closes', values.endsAt ? fmtDateTime(values.endsAt) : 'No closing time'],
    ['Duration', `${values.durationMinutes} minutes`],
    ['Attempts', values.attemptsAllowed],
    ['Shuffle', [values.randomizeQuestions && 'questions', values.randomizeOptions && 'options'].filter(Boolean).join(' and ') || 'Off'],
    ['Proctoring', p.enabled ? `On · ${Number(p.maxViolations) ? `auto-submit at ${p.maxViolations} warnings` : 'no auto-submit'}${p.requireFullscreen ? ' · fullscreen' : ''}` : 'Off'],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <div>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted">How students see it</p>
          <div className="pointer-events-none select-none" aria-hidden>
            <QuizCard hero a={previewQuiz(values, subject, questions.length)} />
          </div>
        </div>
        <Card className="h-fit">
          <div className="border-b border-border p-5">
            <p className="font-display text-xs font-semibold uppercase tracking-wide text-primary-strong">Quiz · 10 marks</p>
            <h2 className="mt-1 text-xl font-bold">{values.title}</h2>
            {values.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{values.description}</p>}
          </div>
          <dl className="divide-y divide-border text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-muted">Paper preview · {questions.length} questions</p>
        {questions.map((q, i) => (
          <QuestionPreview key={q._id} question={q} index={i} showAnswer />
        ))}
      </div>
    </div>
  );
}

export default function QuizBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [saving, setSaving] = useState(null);
  const { data: subjects, loading: subjectsLoading } = useApi('/subjects', { initial: [] });
  const existing = useApi(editing ? `/assessments/${id}` : null);
  const form = useForm({ resolver: zodResolver(quizFormSchema), defaultValues: emptyQuiz, mode: 'onTouched' });
  const { register, watch, setValue, trigger, getValues, reset, formState } = form;
  const values = watch();
  const bank = useApi(values.subject ? `/questions?subject=${values.subject}` : null, { initial: [] });

  useEffect(() => {
    if (existing.data) {
      reset(fromAssessment(existing.data));
      setReached(STEPS.length - 1);
    }
  }, [existing.data, reset]);

  useEffect(() => {
    if (!editing && !getValues('subject') && subjects.length === 1) setValue('subject', subjects[0]._id);
  }, [subjects, editing, getValues, setValue]);

  const byId = useMemo(() => new Map(bank.data.map((q) => [String(q._id), q])), [bank.data]);
  const selectedQuestions = values.questionIds.map((qid) => byId.get(qid)).filter(Boolean);
  const total = sumMarks(selectedQuestions);
  const subject = subjects.find((s) => s._id === values.subject);

  const next = async () => {
    const ok = await trigger(STEPS[step].fields);
    if (!ok) return;
    if (step === 1 && total !== QUIZ_MARKS) return toast.error(`Questions must add up to exactly ${QUIZ_MARKS} marks (currently ${total}).`);
    const n = step + 1;
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (publish) => {
    const ok = await trigger();
    if (!ok) {
      const firstBad = STEPS.findIndex((s) => s.fields.some((f) => formState.errors[f]));
      if (firstBad >= 0) setStep(firstBad);
      return toast.error('Some details need attention');
    }
    if (total !== QUIZ_MARKS) {
      setStep(1);
      return toast.error(`Questions must add up to exactly ${QUIZ_MARKS} marks.`);
    }
    setSaving(publish ? 'publish' : 'draft');
    try {
      const payload = toPayload(getValues());
      if (editing) {
        await api.patch(`/assessments/${id}`, payload);
        if (publish) await api.post(`/assessments/${id}/publish`);
      } else await api.post('/assessments', { ...payload, publish });
      toast.success(publish ? 'Quiz published. Students have been notified.' : 'Draft saved');
      navigate('/assessments');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(null);
    }
  };

  if (editing && existing.loading) return <PageLoader label="Loading quiz…" />;
  if (editing && existing.data && existing.data.state !== 'DRAFT')
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="Only drafts can be edited" description="This quiz has already been published." action={<Button to="/assessments">Back to assessments</Button>} />
      </Card>
    );

  return (
    <>
      <PageHeader
        eyebrow={editing ? 'Edit draft' : 'New quiz'}
        title={values.title || 'Untitled quiz'}
        description="Quizzes are worth exactly 10 marks and use multiple-choice or fill-in questions."
        actions={
          <Button variant="ghost" icon={ArrowLeft} to="/assessments">
            Assessments
          </Button>
        }
      />
      <Card className="mb-6 px-4 py-3">
        <Stepper steps={STEPS} current={step} maxReachable={reached} onStepClick={setStep} />
      </Card>

      {!subjectsLoading && !subjects.length ? (
        <Alert tone="warn" title="You are not allocated to any subject">
          Ask an administrator to allocate you to a subject before creating quizzes.
        </Alert>
      ) : (
        <>
          {step === 0 && (
            <Card className="max-w-3xl p-6">
              <div className="grid gap-5">
                <Select
                  label="Subject"
                  required
                  error={formState.errors.subject?.message}
                  {...register('subject', {
                    onChange: () => setValue('questionIds', []),
                  })}
                >
                  <option value="">Select a subject</option>
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </Select>
                <Input label="Title" required placeholder="e.g. Unit 2 quiz: Trees and graphs" error={formState.errors.title?.message} {...register('title')} />
                <Select label="Counts towards CIE as" hint="Quiz 1 and Quiz 2 marks fill the CIE sheet automatically. Each subject has one of each." {...register('cieSlot')}>
                  <option value="">Practice (not counted)</option>
                  <option value="QUIZ1">Quiz 1 (10 marks)</option>
                  <option value="QUIZ2">Quiz 2 (10 marks)</option>
                </Select>
                <Textarea label="Instructions for students" rows={4} placeholder="Optional. Shown on the rules screen before the quiz starts." {...register('description')} />
              </div>
            </Card>
          )}

          {step === 1 && (
            <QuestionsStep
              subject={values.subject}
              subjects={subjects}
              selectedIds={values.questionIds}
              setSelectedIds={(ids) => setValue('questionIds', ids, { shouldValidate: true })}
              bank={bank.data}
              reloadBank={bank.reload}
              loading={bank.loading}
            />
          )}

          {step === 2 && (
            <div className="grid max-w-4xl gap-6">
              <Card className="p-6">
                <Field label="How do students get in?">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {MODES.map((m) => (
                      <ModeCard key={m.value} mode={m} active={values.availabilityMode === m.value} onSelect={() => setValue('availabilityMode', m.value, { shouldValidate: formState.isSubmitted })} />
                    ))}
                  </div>
                </Field>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Input label="Opens at" type="datetime-local" required={values.availabilityMode === 'scheduled'} hint={values.availabilityMode === 'scheduled' ? undefined : 'Optional: the earliest time it can start.'} error={formState.errors.startsAt?.message} {...register('startsAt')} />
                  <Input label="Closes at" type="datetime-local" hint="Optional. Attempts in progress are submitted at this time." error={formState.errors.endsAt?.message} {...register('endsAt')} />
                </div>
              </Card>
              <Card className="p-6">
                <Field label="Duration" required error={formState.errors.durationMinutes?.message} hint="Each student's timer starts when they begin.">
                  <div className="flex flex-wrap items-center gap-2">
                    {DURATIONS.map((d) => (
                      <button key={d} type="button" onClick={() => setValue('durationMinutes', d, { shouldValidate: true })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${Number(values.durationMinutes) === d ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-surface-2'}`}>
                        {d} min
                      </button>
                    ))}
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-subtle" />
                      <input type="number" min={1} max={600} className="input w-24" aria-label="Custom duration in minutes" {...register('durationMinutes')} />
                      <span className="text-sm text-muted">min</span>
                    </div>
                  </div>
                </Field>
                <div className="mt-6 grid gap-5 sm:grid-cols-[12rem_1fr]">
                  <Input label="Attempts allowed" type="number" min={1} max={10} error={formState.errors.attemptsAllowed?.message} {...register('attemptsAllowed')} />
                  <div className="space-y-4 rounded-xl border border-border p-4">
                    <Switch label="Shuffle question order" description="Each student gets a different order." checked={values.randomizeQuestions} onChange={(v) => setValue('randomizeQuestions', v)} />
                    <Switch label="Shuffle answer choices" description="MCQ options appear in a different order per student." checked={values.randomizeOptions} onChange={(v) => setValue('randomizeOptions', v)} />
                  </div>
                </div>
              </Card>
            </div>
          )}

          {step === 3 && <ProctoringStep value={values.proctoring} onChange={(p) => setValue('proctoring', p, { shouldValidate: true })} errors={formState.errors.proctoring} />}

          {step === 4 && <ReviewStep values={values} subject={subject} questions={selectedQuestions} />}

          <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
            <Button icon={ArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              Back
            </Button>
            {step >= 1 && (
              <span className={`text-sm font-semibold ${total === QUIZ_MARKS ? 'text-success' : 'text-muted'}`}>
                {total} / {QUIZ_MARKS} marks · {selectedQuestions.length} questions
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {step >= 1 && (
                <Button onClick={() => save(false)} loading={saving === 'draft'} disabled={Boolean(saving)}>
                  Save draft
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button variant="primary" onClick={next}>
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button variant="primary" icon={Send} onClick={() => save(true)} loading={saving === 'publish'} disabled={Boolean(saving)}>
                  Publish quiz
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
