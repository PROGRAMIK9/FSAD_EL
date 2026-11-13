import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ListChecks, Plus, TextCursorInput, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { OPTION_KEYS, fromQuestion, questionFormSchema, toQuestionPayload } from '../../lib/schemas.js';
import { Alert, Button, Field, Input, Select, Textarea } from '../../components/ui/index.js';
import { QuestionPreview } from '../../components/domain/QuestionPreview.jsx';

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2/60 p-1">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${value === v ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Create or edit a question. Renders its own actions so it can live in a Modal or a Drawer.
 * `lockSubject` keeps the subject fixed (used inside the quiz builder).
 * `initial` pre-fills a new question (used for duplicating).
 * `onSubmit(values)` replaces saving: the editor hands back its form values instead of calling the
 * API (used to fix drafts read from a question paper before they are imported).
 */
export function QuestionEditor({ subjects, question, initial, defaultSubject, lockSubject, topics = [], onSaved, onCancel, onSubmit, submitLabel }) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(questionFormSchema), defaultValues: fromQuestion(question || initial, defaultSubject || subjects[0]?._id || '') });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' });
  const values = watch();
  const editing = Boolean(question);

  // Keep the "correct" marker on the same option when rows move or are removed.
  const removeOption = (i) => {
    remove(i);
    if (values.correctIndex === i) setValue('correctIndex', -1);
    else if (values.correctIndex > i) setValue('correctIndex', values.correctIndex - 1);
  };
  const moveOption = (from, to) => {
    move(from, to);
    if (values.correctIndex === from) setValue('correctIndex', to);
    else if (values.correctIndex === to) setValue('correctIndex', from);
  };

  useEffect(() => {
    if (values.type === 'single' && fields.length < 2) append([{ text: '' }, { text: '' }].slice(fields.length));
  }, [values.type, fields.length, append]);

  const submit = handleSubmit(async (v) => {
    if (onSubmit) return onSubmit(v);
    try {
      const payload = toQuestionPayload(v);
      const saved = editing ? await api.patch(`/questions/${question._id}`, payload) : await api.post('/questions', payload);
      toast.success(editing ? 'Question updated' : 'Question added');
      onSaved(saved);
    } catch (err) {
      toast.error(String(err));
    }
  });

  const preview = toQuestionPayload({ ...values, options: values.options || [], correctIndex: values.correctIndex ?? -1 });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]" noValidate>
      <div className="space-y-5">
        {question?.locked && <Alert tone="warn" title="This question is in a published quiz">Changes are blocked to keep existing results correct. Duplicate it instead.</Alert>}
        <div className="flex flex-wrap items-end gap-4">
          {!lockSubject && (
            <Select label="Subject" required disabled={editing} className="min-w-[200px] flex-1" error={errors.subject?.message} {...register('subject')}>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          )}
          <Field label="Type">
            <Segmented
              value={values.type}
              onChange={(v) => setValue('type', v, { shouldValidate: false })}
              options={[
                { value: 'single', label: 'Multiple choice', icon: ListChecks },
                { value: 'fill_blank', label: 'Fill in', icon: TextCursorInput },
              ]}
            />
          </Field>
        </div>

        <Textarea label="Question" required rows={3} placeholder="e.g. Which data structure uses first-in, first-out order?" error={errors.text?.message} {...register('text')} data-autofocus />

        {values.type === 'single' ? (
          <Field label="Options" hint="Click the circle to mark the correct answer." error={errors.options?.message || errors.options?.root?.message || errors.correctIndex?.message}>
            <ul className="space-y-2">
              {fields.map((field, i) => {
                const correct = values.correctIndex === i;
                return (
                  <li key={field.id} className={`flex items-center gap-2 rounded-lg border p-1.5 pl-2 transition ${correct ? 'border-success/60 bg-success-soft/50' : 'border-border'}`}>
                    <button type="button" onClick={() => setValue('correctIndex', i, { shouldValidate: true })} className={correct ? 'text-success' : 'text-subtle hover:text-fg'} aria-label={`Mark option ${OPTION_KEYS[i]} correct`} aria-pressed={correct}>
                      {correct ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <span className="w-4 text-center text-xs font-bold text-muted">{OPTION_KEYS[i]}</span>
                    <input className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-subtle" placeholder={`Option ${OPTION_KEYS[i]}`} aria-invalid={errors.options?.[i]?.text ? 'true' : undefined} {...register(`options.${i}.text`)} />
                    {errors.options?.[i]?.text && <span className="text-xs text-danger">Required</span>}
                    <div className="flex">
                      <Button size="sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => moveOption(i, i - 1)} aria-label="Move up" />
                      <Button size="sm" variant="ghost" icon={ArrowDown} disabled={i === fields.length - 1} onClick={() => moveOption(i, i + 1)} aria-label="Move down" />
                      <Button size="sm" variant="ghost" icon={Trash2} disabled={fields.length <= 2} onClick={() => removeOption(i)} aria-label="Remove option" />
                    </div>
                  </li>
                );
              })}
            </ul>
            {fields.length < OPTION_KEYS.length && (
              <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => append({ text: '' })}>
                Add option
              </Button>
            )}
          </Field>
        ) : (
          <Input label="Accepted answer" required placeholder="e.g. Queue" hint="Matching ignores letter case and spaces at either end." error={errors.answer?.message} {...register('answer')} />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Marks" type="number" step="0.5" min="0.5" max="10" required error={errors.marks?.message} {...register('marks')} />
          <Select label="Difficulty" {...register('difficulty')}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Input label="Topic" list="question-topics" placeholder="e.g. Trees" error={errors.topic?.message} {...register('topic')} />
          <datalist id="question-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <Textarea label="Explanation" rows={2} hint="Optional. Shown to students when results are released." {...register('explanation')} />

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={question?.locked}>
            {submitLabel || (editing ? 'Save question' : 'Add question')}
          </Button>
        </div>
      </div>
      <aside className="hidden lg:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
        <div className="sticky top-0">
          <QuestionPreview question={preview} showAnswer />
        </div>
      </aside>
    </form>
  );
}
