import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Code2, Search, TerminalSquare } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { LANGUAGES } from '../../lib/code.js';
import { Alert, Badge, Card, EmptyState, PageHeader, Shape, Skeleton, Squiggle, TagPill } from '../../components/ui/index.js';

const difficultyTone = { easy: 'success', medium: 'warn', hard: 'danger' };

/** Coding problems open for practice in the user's subjects, plus a free playground. */
export default function Practice() {
  const { data: problems, loading, error } = useApi('/practice/questions', { initial: [] });
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const subjects = useMemo(
    () => [...new Map(problems.map((p) => [p.subject?._id, p.subject])).values()].filter(Boolean),
    [problems],
  );
  const shown = problems.filter(
    (p) =>
      (!subject || p.subject?._id === subject) &&
      `${p.title} ${p.topic || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <PageHeader eyebrow="Coding" title="Coding" accent="practice" description="Solve coding problems in C, C++, Java or Python. Practice runs are never graded." />
      <div className="mb-6 grid gap-4 md:grid-cols-[2fr_1fr]">
        <section className="tile tile-lime flex min-h-[11rem] flex-col justify-between !p-6">
          <Shape shape="flower" className="absolute -right-6 -top-8 -z-10 h-36 w-36 rotate-12 text-tile-green" />
          <Squiggle className="absolute inset-x-0 bottom-6 -z-10 h-20 w-full text-white/80" />
          <p className="max-w-md text-xl font-bold leading-snug">
            Write it, run it, <span className="accent text-2xl">get it right.</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <TagPill tone="pink" rotate={-4}>
              #C
            </TagPill>
            <TagPill tone="lavender" rotate={3}>
              #C++
            </TagPill>
            <TagPill tone="yellow" rotate={-2}>
              #Java
            </TagPill>
            <TagPill tone="green" rotate={4}>
              #Python
            </TagPill>
          </div>
        </section>
        <Link to="/practice/playground" className="tile tile-lavender group flex flex-col transition hover:-translate-y-1">
          <Shape shape="asterisk" className="absolute -bottom-6 -right-4 -z-10 h-28 w-28 text-white/50" />
          <span className="tile-chip self-start">
            <TerminalSquare className="h-3 w-3" /> Free run
          </span>
          <p className="mt-3 text-lg font-bold leading-tight">
            Code <span className="accent block text-xl">Playground</span>
          </p>
          <span className="tile-arrow mt-auto self-end group-hover:bg-tile-ink group-hover:text-white" aria-hidden>
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
      {error && (
        <Alert tone="danger" title="Couldn't load problems">
          {error}
        </Alert>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              className="input pl-9"
              placeholder="Search problems"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {subjects.length > 1 && (
            <select
              className="input w-auto"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.code}
                </option>
              ))}
            </select>
          )}
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : shown.length ? (
          <ul className="divide-y divide-border">
            {shown.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/practice/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60"
                >
                  {p.best === 1 ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Solved" />
                  ) : (
                    <Code2 className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{p.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                      {p.subject?.code && <span>{p.subject.code}</span>}
                      {p.topic && <span>{p.topic}</span>}
                      <span>{(p.languages || []).map((l) => LANGUAGES[l]?.label || l).join(' · ')}</span>
                    </p>
                  </div>
                  {p.best != null && p.best < 1 && (
                    <span className="text-xs tabular text-muted">best {Math.round(p.best * 100)}%</span>
                  )}
                  {p.difficulty && <Badge tone={difficultyTone[p.difficulty]}>{p.difficulty}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Code2}
            title={problems.length ? 'No problems match' : 'No practice problems yet'}
            description={
              problems.length
                ? undefined
                : 'Your teachers have not opened any coding problems for practice. You can still try code in the playground.'
            }
          />
        )}
      </Card>
    </div>
  );
}
