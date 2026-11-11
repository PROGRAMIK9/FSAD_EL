import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BarChart3, ClipboardList, Trophy } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { Button, Card, EmptyState, ExportMenu, PageHeader, ScoreRing, SectionTitle, Skeleton, StatCard } from '../../components/ui/index.js';
import { hueFor } from '../../components/domain/QuizCard.jsx';
import { fmtDate } from '../../lib/format.js';

const pct = (g) => (g.maxMarks ? (g.rawMarks / g.maxMarks) * 100 : 0);

function GradeCard({ g }) {
  const a = g.assessment || {};
  return (
    <Link to={`/results/${a._id}`} className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <span className={`card-hero ${hueFor(a.subject?.code)} grid h-12 w-12 shrink-0 place-items-center !rounded-2xl font-display text-[10.5px] font-bold !shadow-none`}>{a.subject?.code}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-semibold text-fg">{a.title || 'Quiz'}</p>
        <p className="truncate text-xs text-muted">
          {a.subject?.name} · published {fmtDate(g.publishedAt, { day: 'numeric', month: 'short' })}
        </p>
        {g.feedback && <p className="mt-1 line-clamp-1 text-xs text-subtle">“{g.feedback}”</p>}
      </div>
      <ScoreRing score={g.rawMarks} max={g.maxMarks || 10} size={56} />
      <ArrowRight className="hidden h-4 w-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary sm:block" />
    </Link>
  );
}

/** Student's published results, linking to each per-question review. */
export default function MyGrades() {
  const { data: grades, loading } = useApi('/grades/student', { initial: [] });
  const stats = useMemo(() => {
    if (!grades.length) return null;
    const p = grades.map(pct);
    return { avg: Math.round(p.reduce((n, x) => n + x, 0) / p.length), best: Math.round(Math.max(...p)), perfect: grades.filter((g) => g.rawMarks === g.maxMarks).length };
  }, [grades]);

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="My grades"
        description="Published quiz results. Open one to see every answer, the correct option and your teacher's notes."
        actions={grades.length > 0 && <ExportMenu path="/grades/student/export" label="Download" />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard variant="hero" loading={loading} label="Average" value={stats ? `${stats.avg}%` : '—'} hint={`${grades.length} published result${grades.length === 1 ? '' : 's'}`} icon={BarChart3} />
        <StatCard loading={loading} label="Best score" value={stats ? `${stats.best}%` : '—'} icon={Trophy} tone="success" />
        <StatCard loading={loading} label="Perfect scores" value={stats?.perfect ?? 0} hint="Full marks" icon={Award} tone="warn" />
      </div>
      <section className="mt-9">
        <SectionTitle>Results</SectionTitle>
        {loading && !grades.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : grades.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {grades.map((g) => (
              <GradeCard key={g._id} g={g} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="No published results yet"
              description="Your scores appear here as soon as your teachers publish them."
              action={
                <Button to="/assessments" variant="primary">
                  Go to quizzes
                </Button>
              }
            />
          </Card>
        )}
      </section>
    </>
  );
}
