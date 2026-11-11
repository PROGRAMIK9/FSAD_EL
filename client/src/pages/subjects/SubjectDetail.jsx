import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, BookMarked, ClipboardList, ExternalLink, FlaskConical, GraduationCap, Layers, ListChecks, Pencil, Scale, Target, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Avatar, Button, Card, EmptyState, MetaPill, SectionTitle, Skeleton, StatusBadge, Tabs } from '../../components/ui/index.js';
import { QuizCard, hueFor } from '../../components/domain/QuizCard.jsx';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

function UnitCard({ unit, questions }) {
  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-ink px-2.5 py-0.5 font-display text-xs font-semibold text-ink-fg">Unit {ROMAN[unit.number] || unit.number}</span>
        <span className="chip">{unit.hours} hours</span>
        {questions != null && <span className="chip ml-auto bg-surface-2 text-muted">{questions} questions</span>}
      </div>
      <h3 className="mt-3 font-display text-base font-semibold leading-snug">{unit.title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {unit.topics.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function NumberedList({ items }) {
  return (
    <ol className="space-y-2">
      {items.map((text, i) => (
        <li key={text} className="card flex gap-4 p-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-sm font-bold text-primary-strong">{i + 1}</span>
          <span className="pt-1 text-sm">{text}</span>
        </li>
      ))}
    </ol>
  );
}

function MarksTable({ title, rows, valueKey = 'marks', total }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      <table className="table-base">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <p className="font-medium">{r.name}</p>
                {r.detail && <p className="mt-0.5 text-xs text-muted">{r.detail}</p>}
              </td>
              <td className="w-24 text-right font-display font-semibold tabular">{r[valueKey]}</td>
            </tr>
          ))}
          {total != null && (
            <tr>
              <td className="font-semibold">Total</td>
              <td className="text-right font-display font-bold text-primary-strong tabular">{total}</td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

const sum = (rows) => rows.reduce((n, r) => n + (r.marks || 0), 0);

export default function SubjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const { data: s, loading, error } = useApi(`/subjects/${id}`);
  const { data: assessments } = useApi('/assessments', { initial: [] });
  const quizzes = useMemo(() => assessments.filter((a) => String(a.subject?._id || a.subject) === id), [assessments, id]);
  const [tab, setTab] = useState('units');

  if (loading && !s)
    return (
      <div className="space-y-5">
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  if (error)
    return (
      <Card>
        <EmptyState icon={BookMarked} title="Subject not available" description={error} action={<Button to="/subjects">Back to subjects</Button>} />
      </Card>
    );

  const syl = s.syllabus || {};
  const hasUnits = syl.units?.length > 0;
  const tabs = [
    hasUnits ? { value: 'units', label: 'Syllabus', icon: Layers, count: syl.units.length } : { value: 'units', label: 'Guidelines', icon: ListChecks },
    syl.lab?.length && { value: 'lab', label: 'Lab', icon: FlaskConical, count: syl.lab.length },
    { value: 'outcomes', label: 'Outcomes & books', icon: Target },
    { value: 'evaluation', label: 'Evaluation', icon: Scale },
    hasUnits && { value: 'quizzes', label: 'Quizzes', icon: ClipboardList, count: quizzes.length },
  ].filter(Boolean);

  return (
    <>
      <Button variant="ghost" size="sm" icon={ArrowLeft} to="/subjects" className="-ml-2 mb-3">
        Subjects
      </Button>

      <section className={`card-hero ${hueFor(s.code)} p-6 sm:p-8`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip-light">{s.code}</span>
              {syl.category && <span className="chip chip-glass">{syl.category}</span>}
              {syl.mode && <span className="chip chip-glass">{syl.mode}</span>}
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{s.name}</h1>
            <p className="mt-1 text-sm text-white/85">
              {s.department?.name} · Semester {s.semester} · {s.academicYear}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
              <MetaPill value={s.credits} label="Credits" onHero />
              {syl.ltp && <MetaPill value={syl.ltp} label="L-T-P" onHero />}
              {syl.hours && <MetaPill value={syl.hours} label="Hours" onHero />}
              <MetaPill value={s.studentCount} label="Students" onHero />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:min-w-[22rem]">
            {[
              ['CIE', syl.cieMarks],
              ['SEE', syl.seeMarks],
              ['SEE time', syl.seeDuration],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/15 px-3 py-2.5 text-center ring-1 ring-inset ring-white/20">
                <p className="font-display text-lg font-bold">{v || '—'}</p>
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">{k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <Tabs className="mb-5" items={tabs} value={tab} onChange={setTab} />

          {tab === 'units' &&
            (hasUnits ? (
              <div className="grid gap-5 md:grid-cols-2">
                {syl.units.map((u) => (
                  <UnitCard key={u.number} unit={u} questions={s.questionsByTopic ? s.questionsByTopic[`Unit ${ROMAN[u.number]}: ${u.title}`] || 0 : null} />
                ))}
              </div>
            ) : (
              <NumberedList items={syl.guidelines || []} />
            ))}

          {tab === 'lab' && <NumberedList items={syl.lab} />}

          {tab === 'outcomes' && (
            <div className="space-y-8">
              <section>
                <SectionTitle>Course outcomes</SectionTitle>
                <div className="space-y-2">
                  {(syl.outcomes || []).map((o) => (
                    <div key={o.code} className="card flex gap-4 p-4">
                      <span className="chip h-fit shrink-0 bg-ink text-ink-fg">{o.code}</span>
                      <p className="text-sm">{o.text}</p>
                    </div>
                  ))}
                </div>
              </section>
              {syl.references?.length > 0 && (
                <section>
                  <SectionTitle>Reference books</SectionTitle>
                  <NumberedList items={syl.references} />
                </section>
              )}
              {syl.resources?.length > 0 && (
                <section>
                  <SectionTitle>Online resources</SectionTitle>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {syl.resources.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="card flex items-center gap-3 p-3.5 text-sm font-medium transition hover:shadow-lift">
                        <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{r.label}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'evaluation' &&
            (syl.cie ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <MarksTable title="Continuous Internal Evaluation (theory)" rows={syl.cie.components} total={sum(syl.cie.components)} />
                </div>
                {syl.see && <MarksTable title="Semester End Examination (theory)" rows={syl.see} total={sum(syl.see)} />}
                {syl.cieLab && <MarksTable title="CIE (lab)" rows={syl.cieLab} total={sum(syl.cieLab)} />}
                {syl.seeLab && <MarksTable title="SEE (lab)" rows={syl.seeLab} total={sum(syl.seeLab)} />}
              </div>
            ) : syl.evaluation ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <MarksTable title="Continuous Internal Evaluation" rows={syl.evaluation.cie} valueKey="weight" />
                <MarksTable title="Semester End Examination" rows={syl.evaluation.see} valueKey="weight" />
                {syl.evaluation.note && <p className="text-sm text-muted lg:col-span-2">{syl.evaluation.note}</p>}
              </div>
            ) : (
              <Card>
                <EmptyState icon={Scale} title="No evaluation scheme recorded" />
              </Card>
            ))}

          {tab === 'quizzes' &&
            (quizzes.length ? (
              isStudent ? (
                <div className="grid gap-5 md:grid-cols-2">
                  {quizzes.map((a) => (
                    <QuizCard key={a._id} a={a} hero={['AVAILABLE', 'LIVE', 'PAUSED'].includes(a.state)} />
                  ))}
                </div>
              ) : (
                <Card>
                  <ul className="divide-y divide-border/70">
                    {quizzes.map((a) => (
                      <li key={a._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display font-semibold">{a.title}</p>
                          <p className="text-xs text-muted">
                            {a.questionCount} questions · {a.maxMarks} marks · {a.durationMinutes} min
                          </p>
                        </div>
                        <StatusBadge state={a.state} />
                        {a.state === 'DRAFT' ? (
                          <Button size="sm" icon={Pencil} to={`/assessments/${a._id}/edit`}>
                            Review & publish
                          </Button>
                        ) : (
                          <Button size="sm" to={`/assessments/${a._id}/monitor`}>
                            Report
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            ) : (
              <Card>
                <EmptyState icon={ClipboardList} title="No quizzes yet" description={isStudent ? 'Quizzes appear here once your teacher publishes them.' : 'Create one from the question bank.'} />
              </Card>
            ))}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <p className="flex items-center gap-2 font-display text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-primary" /> Faculty
            </p>
            {s.teachers?.length ? (
              <ul className="mt-3 space-y-3">
                {s.teachers.map((t) => (
                  <li key={t._id} className="flex items-center gap-3">
                    <Avatar name={t.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted">{t.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No faculty allocated yet.{user.role === 'admin' ? ' Allocate teachers from the Subjects page.' : ''}</p>
            )}
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 font-display text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> Class
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular">{s.studentCount}</p>
            <p className="text-xs text-muted">students enrolled</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
