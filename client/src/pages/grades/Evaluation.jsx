import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, BarChart3, CheckCheck, ClipboardCheck, Radio, Send, Trophy, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Avatar, Badge, Button, Card, DataTable, ExportMenu, EmptyState, PageHeader, ProgressBar, StatCard, StatusBadge, useConfirm } from '../../components/ui/index.js';
import { fmtDateTime } from '../../lib/format.js';

/** Teacher view: auto-marked results per quiz, with per-student and bulk publishing. */
export default function Evaluation() {
  const confirm = useConfirm();
  const { data: assessments, loading: loadingList } = useApi('/assessments', { initial: [] });
  const graded = useMemo(() => assessments.filter((a) => a.state !== 'DRAFT' && a.attemptStats?.submitted > 0), [assessments]);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (!selected && graded[0]) setSelected(graded[0]._id);
  }, [graded, selected]);
  const { data: grades, loading, reload } = useApi(selected ? `/grades/assessment/${selected}` : null, { initial: [] });
  const [busy, setBusy] = useState(null);

  const quiz = graded.find((a) => a._id === selected);
  const pending = grades.filter((g) => !g.publishedAt);
  const max = quiz?.maxMarks || 10;
  const avg = grades.length ? Math.round((grades.reduce((n, g) => n + (g.rawMarks || 0), 0) / grades.length) * 10) / 10 : null;
  const top = grades.length ? Math.max(...grades.map((g) => g.rawMarks || 0)) : null;

  const publish = async (ids) => {
    setBusy(ids.length > 1 ? 'all' : ids[0]);
    try {
      for (const id of ids) await api.post(`/grades/${id}/publish`);
      toast.success(ids.length > 1 ? `Published ${ids.length} results` : 'Result published');
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };
  const publishAll = async () => {
    if (await confirm({ title: `Publish ${pending.length} result${pending.length === 1 ? '' : 's'}?`, body: 'Students are notified and can see their score, the correct answers and your feedback.', confirmLabel: 'Publish all' })) publish(pending.map((g) => g._id));
  };

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="Evaluation"
        description="Quizzes are marked automatically. Check the scores, then publish them to students."
        actions={
          quiz && (
            <>
              <Button icon={Radio} to={`/assessments/${quiz._id}/monitor`}>
                Quiz report
              </Button>
              <ExportMenu path={`/assessments/${quiz._id}/results`} />
              <Button variant="primary" icon={CheckCheck} disabled={!pending.length} loading={busy === 'all'} onClick={publishAll}>
                Publish all{pending.length ? ` (${pending.length})` : ''}
              </Button>
            </>
          )
        }
      />

      {!loadingList && !graded.length ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title="Nothing to evaluate yet" description="Results appear here once students submit a quiz." action={<Button to="/assessments">Go to assessments</Button>} />
        </Card>
      ) : (
        <>
          <div className="mb-6 flex gap-3 overflow-x-auto pb-1 scrollbar-thin" role="tablist" aria-label="Quizzes">
            {graded.map((a) => {
              const active = a._id === selected;
              return (
                <button
                  key={a._id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(a._id)}
                  className={`min-w-[15rem] shrink-0 rounded-2xl p-4 text-left transition ${active ? 'card-hero !shadow-hero' : 'card hover:-translate-y-0.5 hover:shadow-lift'}`}
                >
                  <span className={active ? 'chip chip-light' : 'chip'}>{a.subject?.code}</span>
                  <p className={`mt-2 truncate font-display font-semibold ${active ? '' : 'text-fg'}`}>{a.title}</p>
                  <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${active ? 'text-white/85' : 'text-muted'}`}>
                    <Users className="h-3.5 w-3.5" /> {a.attemptStats.submitted} submitted
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard loading={loading} label="Average" value={avg != null ? `${avg}/${max}` : '—'} hint={`${grades.length} student${grades.length === 1 ? '' : 's'}`} icon={BarChart3} />
            <StatCard loading={loading} label="Highest" value={top != null ? `${top}/${max}` : '—'} icon={Trophy} tone="success" />
            <StatCard loading={loading} label="Waiting to publish" value={pending.length} hint={pending.length ? 'Students cannot see these yet' : 'Everything is published'} icon={Send} tone={pending.length ? 'warn' : 'info'} />
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold">{quiz?.title || 'Results'}</h2>
                {quiz && <p className="text-sm text-muted">{quiz.subject?.name}</p>}
              </div>
              {quiz && <StatusBadge state={quiz.state} />}
            </div>
            <DataTable
              loading={loading}
              rows={grades}
              empty="No results for this quiz yet."
              columns={[
                {
                  key: 'student',
                  label: 'Student',
                  sortable: true,
                  sortValue: (g) => g.student?.name,
                  render: (g) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={g.student?.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{g.student?.name}</p>
                        <p className="font-mono text-xs text-muted">{g.student?.usn || g.student?.email}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'rawMarks',
                  label: 'Score',
                  sortable: true,
                  render: (g) => (
                    <div className="w-28">
                      <span className="font-display text-sm font-semibold tabular">
                        {g.rawMarks}
                        <span className="text-muted">/{g.maxMarks || max}</span>
                      </span>
                      <ProgressBar className="mt-1.5" size="sm" value={g.rawMarks || 0} max={g.maxMarks || max} tone={g.rawMarks / (g.maxMarks || max) >= 0.7 ? 'success' : g.rawMarks / (g.maxMarks || max) >= 0.4 ? 'primary' : 'warn'} />
                    </div>
                  ),
                },
                {
                  key: 'publishedAt',
                  label: 'Status',
                  sortable: true,
                  sortValue: (g) => (g.publishedAt ? 1 : 0),
                  render: (g) =>
                    g.publishedAt ? (
                      <div>
                        <Badge tone="success" dot>
                          Published
                        </Badge>
                        <p className="mt-1 text-xs text-subtle">{fmtDateTime(g.publishedAt)}</p>
                      </div>
                    ) : (
                      <Badge tone="warn" dot>
                        Not published
                      </Badge>
                    ),
                },
                {
                  key: 'actions',
                  label: '',
                  align: 'right',
                  render: (g) => (
                    <div className="flex justify-end gap-1">
                      {g.attempt && (
                        <Button size="sm" variant="ghost" to={`/assessments/${selected}/attempts/${g.attempt}`}>
                          Answers <ArrowRight />
                        </Button>
                      )}
                      {!g.publishedAt && (
                        <Button size="sm" variant="primary" icon={Send} loading={busy === g._id} onClick={() => publish([g._id])}>
                          Publish
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
