import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Info, Sigma, Users, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, EmptyState, ExportMenu, PageHeader, Skeleton, StatCard, Tabs, useConfirm } from '../../components/ui/index.js';
import { fmtDateTime } from '../../lib/format.js';

const FIELDS = [
  { key: 'test1', label: 'Test 1', max: 50 },
  { key: 'test2', label: 'Test 2', max: 50 },
  { key: 'el1', label: 'EL I', max: 20 },
  { key: 'el2', label: 'EL II', max: 20 },
];
const LAB_FIELDS = [
  { key: 'labRecord', label: 'Lab record', max: 40 },
  { key: 'labTest', label: 'Lab test', max: 10 },
];
const show = (v) => (v === null || v === undefined ? '—' : v);

/** Number cell that saves on blur. Empty clears the mark. */
function MarkInput({ value, max, label, onSave }) {
  const [text, setText] = useState(value ?? '');
  const [state, setState] = useState('idle'); // idle | saving | error
  const original = value ?? '';
  const commit = async () => {
    const trimmed = String(text).trim();
    if (trimmed === String(original)) return;
    const n = trimmed === '' ? null : Number(trimmed);
    if (n !== null && (Number.isNaN(n) || n < 0 || n > max)) {
      setState('error');
      toast.error(`${label}: enter a mark from 0 to ${max}`);
      return;
    }
    setState('saving');
    try {
      await onSave(n);
      setState('idle');
    } catch (e) {
      setState('error');
      toast.error(String(e));
    }
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={max}
      step={0.5}
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        if (state === 'error') setState('idle');
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`h-9 w-16 rounded-lg border bg-surface px-2 text-center text-sm tabular transition focus:outline-none focus:ring-4 ${
        state === 'error' ? 'border-danger focus:ring-danger/15' : state === 'saving' ? 'border-primary/50 opacity-70' : 'border-border focus:border-primary focus:ring-primary/15'
      }`}
    />
  );
}

function StatusCell({ result }) {
  if (result.eligible === null)
    return (
      <Badge tone="neutral" dot>
        Pending
      </Badge>
    );
  return result.eligible ? (
    <Badge tone="success" dot>
      Clears
    </Badge>
  ) : (
    <Badge tone="danger" dot>
      Below 30
    </Badge>
  );
}

export default function CieSheet() {
  const { id } = useParams();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useApi(`/subjects/${id}/cie`);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const rows = data?.rows || [];
  const stats = useMemo(() => {
    const complete = rows.filter((r) => !r.result.missing.length);
    const totals = complete.map((r) => r.result.total);
    return {
      complete: complete.length,
      eligible: rows.filter((r) => r.result.eligible === true).length,
      below: rows.filter((r) => r.result.eligible === false).length,
      avg: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null,
    };
  }, [rows]);

  if (loading && !data) return <Skeleton className="h-96 rounded-3xl" />;
  if (error)
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="CIE sheet unavailable" description={error} action={<Button to={`/subjects/${id}`}>Back</Button>} />
      </Card>
    );

  const { subject, hasLab, quizzes } = data;
  const fields = hasLab ? [...FIELDS, ...LAB_FIELDS] : FIELDS;
  const slotTitle = (slot) => quizzes.find((q) => q.cieSlot === slot)?.title;
  const shown = rows.filter((r) => (filter === 'missing' ? r.result.missing.length : filter === 'below' ? r.result.eligible === false : true));

  const save = async (studentId, key, value) => {
    const row = await api.patch(`/subjects/${id}/cie/${studentId}`, { [key]: value });
    setData((d) => ({ ...d, rows: d.rows.map((r) => (r.student._id === studentId ? row : r)) }));
  };

  const togglePublish = async () => {
    const publishing = !subject.ciePublishedAt;
    if (
      publishing &&
      !(await confirm({
        title: 'Publish CIE marks?',
        body: `Students in ${subject.code} will see their CIE breakdown${stats.complete < rows.length ? `. ${rows.length - stats.complete} student(s) still have missing marks` : ''}.`,
        confirmLabel: 'Publish',
      }))
    )
      return;
    setBusy(true);
    try {
      await api.post(`/subjects/${id}/cie/${publishing ? 'publish' : 'unpublish'}`);
      toast.success(publishing ? 'CIE marks published' : 'CIE marks hidden from students');
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" icon={ArrowLeft} to={`/subjects/${id}`} className="-ml-2 mb-3">
        {subject.code} · {subject.name}
      </Button>
      <PageHeader
        eyebrow="Continuous internal evaluation"
        title={`CIE sheet · ${subject.code}`}
        description={`Quizzes 20 + tests 40 (two tests of 50, reduced) + experiential learning 40 = 100${hasLab ? '; CIE lab 50 (record 40 + lab test 10)' : ''}. Quiz + test must reach 30 of 60.`}
        actions={
          <>
            <ExportMenu path={`/subjects/${id}/cie`} />
            <Button variant={subject.ciePublishedAt ? 'secondary' : 'primary'} icon={subject.ciePublishedAt ? EyeOff : Eye} loading={busy} onClick={togglePublish}>
              {subject.ciePublishedAt ? 'Unpublish' : 'Publish to students'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard variant="hero" label="Average CIE" value={stats.avg != null ? `${stats.avg}/100` : '—'} hint={`${stats.complete} of ${rows.length} complete`} icon={Sigma} />
        <StatCard label="Students" value={rows.length} icon={Users} tone="info" />
        <StatCard label="Clear quiz + test" value={stats.eligible} hint="30 or more of 60" icon={CheckCircle2} tone="success" />
        <StatCard label="Below 30 of 60" value={stats.below} hint="Do not clear CIE yet" icon={XCircle} tone="danger" />
      </div>

      {subject.ciePublishedAt && (
        <Alert tone="success" icon={Eye} className="mt-5" title={`Published ${fmtDateTime(subject.ciePublishedAt)}`}>
          Students can see their marks. Changes you make now are visible to them immediately.
        </Alert>
      )}
      {(!slotTitle('QUIZ1') || !slotTitle('QUIZ2')) && (
        <Alert tone="warn" icon={Info} className="mt-5" title="Quiz columns need a CIE quiz">
          {!slotTitle('QUIZ1') && 'No quiz counts as Quiz 1. '}
          {!slotTitle('QUIZ2') && 'No quiz counts as Quiz 2. '}
          Set "Counts towards CIE as" in the quiz builder.
        </Alert>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'missing', label: 'Missing marks', count: rows.length - stats.complete },
              { value: 'below', label: 'Below 30', count: stats.below },
            ]}
          />
          <p className="text-xs text-muted">Type a mark and press Enter or Tab to save. Leave empty to clear.</p>
        </div>
        {shown.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table-base whitespace-nowrap">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface">Student</th>
                  <th title={slotTitle('QUIZ1')}>Quiz 1 /10</th>
                  <th title={slotTitle('QUIZ2')}>Quiz 2 /10</th>
                  <th>Quiz /20</th>
                  {FIELDS.slice(0, 2).map((f) => (
                    <th key={f.key}>
                      {f.label} /{f.max}
                    </th>
                  ))}
                  <th>Tests /40</th>
                  {FIELDS.slice(2).map((f) => (
                    <th key={f.key}>
                      {f.label} /{f.max}
                    </th>
                  ))}
                  <th>EL /40</th>
                  <th>CIE /100</th>
                  {hasLab &&
                    LAB_FIELDS.map((f) => (
                      <th key={f.key}>
                        {f.label} /{f.max}
                      </th>
                    ))}
                  {hasLab && <th>Lab /50</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const cell = (f) => (
                    <td key={f.key}>
                      <MarkInput key={`${r.student._id}-${f.key}-${r.marks[f.key] ?? ''}`} value={r.marks[f.key]} max={f.max} label={`${f.label} for ${r.student.name}`} onSave={(v) => save(r.student._id, f.key, v)} />
                    </td>
                  );
                  const quiz = (k) => (
                    <td className="tabular">
                      {show(r.marks[k])}
                      {r.marks[k] != null && !r.quizPublished[k] && <span className="ml-1 text-xs text-warn" title="Grade not yet published">•</span>}
                    </td>
                  );
                  return (
                    <tr key={r.student._id}>
                      <td className="sticky left-0 z-10 bg-surface">
                        <p className="font-medium">{r.student.name}</p>
                        <p className="font-mono text-xs text-muted">{r.student.usn || r.student.email}</p>
                      </td>
                      {quiz('quiz1')}
                      {quiz('quiz2')}
                      <td className="font-display font-semibold tabular">{show(r.result.quizzes)}</td>
                      {fields.slice(0, 2).map(cell)}
                      <td className="font-display font-semibold tabular">{show(r.result.tests)}</td>
                      {fields.slice(2, 4).map(cell)}
                      <td className="font-display font-semibold tabular">{show(r.result.el)}</td>
                      <td className="font-display text-base font-bold text-primary-strong tabular">{show(r.result.total)}</td>
                      {hasLab && fields.slice(4).map(cell)}
                      {hasLab && <td className="font-display font-semibold tabular">{show(r.result.lab)}</td>}
                      <td>
                        <StatusCell result={r.result} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title={rows.length ? 'Nobody in this view' : 'No students enrolled yet'} className="py-10" />
        )}
      </Card>
      <p className="mt-3 text-xs text-subtle">
        <span className="text-warn">•</span> quiz grade not yet published to the student.
      </p>
    </>
  );
}
