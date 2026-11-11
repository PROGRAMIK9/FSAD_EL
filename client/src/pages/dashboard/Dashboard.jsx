import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowRight, Atom, Binary, BookOpen, ClipboardCheck, ClipboardList, Cpu, Database, GraduationCap, Inbox, MessageSquareWarning, Network, NotebookPen, Plus, Radio, Sigma, Sparkles, Trophy, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useThemeColors } from '../../hooks/useThemeColors.js';
import { Button, Card, CardHeader, DataTable, EmptyState, ExportMenu, PageHeader, Ring, ScoreRing, SectionTitle, StatCard } from '../../components/ui/index.js';
import { QuizCard, hueFor, studentActionFor } from '../../components/domain/QuizCard.jsx';
import { AssessmentList } from '../../components/domain/AssessmentList.jsx';
import { SubjectCard } from '../../components/domain/SubjectCard.jsx';
import { fmtDate, fmtDateTime, greeting, humanize } from '../../lib/format.js';

const ACTIVE = ['LIVE', 'PAUSED', 'AVAILABLE', 'SCHEDULED'];

function upcomingFirst(assessments) {
  const rank = { LIVE: 0, PAUSED: 1, AVAILABLE: 2, SCHEDULED: 3 };
  return assessments
    .filter((a) => ACTIVE.includes(a.state))
    .sort((a, b) => rank[a.state] - rank[b.state] || new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
}

function PerformanceChart({ data }) {
  const c = useThemeColors();
  if (!data.length) return <EmptyState icon={Trophy} title="No published results yet" description="Averages appear once grades are published." className="py-10" />;
  return (
    <div className="h-64 px-2 pb-4 pt-2">
      <ResponsiveContainer>
        <BarChart data={data} barSize={32}>
          <CartesianGrid vertical={false} stroke={c.border} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: c.muted }} />
          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: c.subtle }} unit="%" width={44} />
          <Tooltip cursor={{ fill: c.border, opacity: 0.4 }} contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.fg }} formatter={(v) => [`${v}%`, 'Average']} />
          <Bar dataKey="average" fill={c.primary} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminDashboard({ assessments }) {
  const { data, loading } = useApi('/admin/dashboard');
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Students" value={data?.students} hint={`${data?.activeStudents ?? '—'} active accounts`} icon={Users} />
        <StatCard loading={loading} label="Faculty" value={data?.teachers} hint={`${data?.departments ?? '—'} departments`} icon={GraduationCap} tone="success" />
        <StatCard loading={loading} label="Subjects" value={data?.subjects} hint={`${data?.activeSemesters ?? '—'} active semesters`} icon={BookOpen} tone="info" />
        <StatCard loading={loading} label="Assessments" value={data?.assessments} hint={`${data?.upcoming ?? 0} upcoming · ${data?.ongoing ?? 0} live`} icon={ClipboardList} tone="warn" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Academic performance" description="Average score of published results" actions={<ExportMenu path="/admin/reports/grades" size="sm" label="Grades" />} />
          <PerformanceChart data={data?.performance || []} />
        </Card>
        <Card>
          <CardHeader title="Assessment schedule" description="Live and upcoming" actions={<Button size="sm" variant="ghost" to="/assessments" icon={ArrowRight} />} />
          <AssessmentList items={upcomingFirst(assessments).slice(0, 5)} empty="Nothing scheduled." />
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Recent activity" description="Audited changes across the platform" actions={<Button size="sm" variant="ghost" to="/audit">View all</Button>} />
        <DataTable
          loading={loading}
          rows={data?.recentActivity || []}
          empty="No recent activity."
          columns={[
            { key: 'when', label: 'When', render: (r) => <span className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</span> },
            { key: 'actor', label: 'Actor', render: (r) => r.actor?.name || 'System' },
            { key: 'action', label: 'Action', render: (r) => humanize(r.action) },
            { key: 'entity', label: 'Entity', render: (r) => <span className="text-muted">{r.entityType || '—'}</span> },
          ]}
        />
      </Card>
    </>
  );
}

function TeacherDashboard({ assessments, subjects, summary, loading }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="My subjects" value={summary?.subjects} hint={`${summary?.assignments ?? 0} assignments`} icon={BookOpen} />
        <StatCard loading={loading} label="Live now" value={summary?.live} hint={`${summary?.upcoming ?? 0} upcoming · ${summary?.drafts ?? 0} drafts`} icon={Radio} tone="success" />
        <StatCard loading={loading} label="Results to publish" value={summary?.unpublishedGrades} hint="Grades awaiting release" icon={ClipboardCheck} tone="warn" />
        <StatCard loading={loading} label="Open grade queries" value={summary?.openReviews} hint="Student clarification requests" icon={MessageSquareWarning} tone="danger" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Assessment schedule" description="Live and upcoming quizzes" actions={<Button size="sm" variant="primary" icon={Plus} to="/assessments/new">New quiz</Button>} />
          <AssessmentList items={upcomingFirst(assessments).slice(0, 6)} empty="No upcoming quizzes." />
        </Card>
        <SubjectsPanel subjects={subjects} />
      </div>
    </>
  );
}

const SUBJECT_ICONS = [
  [/network|communication/i, Network],
  [/data ?base|dbms|sql/i, Database],
  [/algorithm|data structure/i, Binary],
  [/math|calculus|statistic|discrete/i, Sigma],
  [/physics|chemistry|science/i, Atom],
  [/system|architecture|processor|micro/i, Cpu],
];
const subjectIcon = (name = '') => SUBJECT_ICONS.find(([re]) => re.test(name))?.[1] || BookOpen;

function SubjectTile({ s, quizzes }) {
  const Icon = subjectIcon(s.name);
  const open = quizzes.filter((a) => ['AVAILABLE', 'LIVE', 'PAUSED'].includes(a.state)).length;
  return (
    <article className={`card-hero ${hueFor(s.code)} flex min-h-[196px] flex-col p-5 pb-16`}>
      <Icon className="pointer-events-none absolute right-4 top-4 -z-10 h-16 w-16 text-white/25" strokeWidth={1.25} aria-hidden />
      <span className="chip chip-light self-start">{s.code}</span>
      <h3 className="mt-auto pt-6 font-display text-[15px] font-bold uppercase leading-snug tracking-wide">{s.name}</h3>
      <p className="mt-1 text-xs text-white/85">
        {quizzes.length} quiz{quizzes.length === 1 ? '' : 'zes'}
        {open ? ` · ${open} open now` : ''}
      </p>
      <Button variant="ink" className="cta-corner" to={`/subjects/${s._id}`}>
        Open <ArrowRight />
      </Button>
    </article>
  );
}

function CaughtUpHero() {
  return (
    <article className="card-hero flex min-h-[240px] flex-col justify-center p-7 pb-16">
      <Sparkles className="pointer-events-none absolute right-8 top-8 -z-10 h-24 w-24 text-white/20" strokeWidth={1.25} aria-hidden />
      <span className="chip chip-light self-start">All caught up</span>
      <h2 className="mt-3 max-w-sm text-2xl font-bold leading-tight">No quiz is open right now</h2>
      <p className="mt-1 max-w-sm text-sm text-white/85">You will get a notification the moment your teacher opens one.</p>
      <Button variant="ink" className="cta-corner" to="/assessments">
        Browse quizzes <ArrowRight />
      </Button>
    </article>
  );
}

function ProgressCard({ summary, loading }) {
  const avg = summary?.averagePercent;
  const rows = [
    { icon: BookOpen, label: 'Subjects', value: summary?.subjects, to: '/subjects' },
    { icon: ClipboardList, label: 'Upcoming quizzes', value: summary?.upcoming, to: '/assessments' },
    { icon: NotebookPen, label: 'Assignments due', value: summary?.pendingAssignments, to: '/assignments' },
  ];
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[15px] font-semibold">Your progress</h2>
        <Button size="sm" variant="ghost" to="/grades">
          Grades <ArrowRight />
        </Button>
      </div>
      <div className="mt-4 flex flex-1 items-center gap-5">
        <Ring value={avg ?? 0} max={100} size={112} stroke={10} color={avg == null ? 'rgb(var(--c-border))' : avg >= 70 ? 'rgb(var(--c-success))' : 'rgb(var(--c-primary))'} label={avg == null ? 'No results yet' : `Average ${avg}%`}>
          <span className="text-center leading-none">
            <span className="block font-display text-2xl font-bold tabular">{loading ? '…' : avg == null ? '—' : `${Math.round(avg)}%`}</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">average</span>
          </span>
        </Ring>
        <ul className="min-w-0 flex-1 space-y-1">
          {rows.map(({ icon: Icon, label, value, to }) => (
            <li key={label}>
              <Link to={to} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{label}</span>
                <span className="font-display text-base font-bold tabular">{loading ? '…' : (value ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-subtle">{summary?.publishedGrades ? `Based on ${summary.publishedGrades} published result${summary.publishedGrades === 1 ? '' : 's'}` : 'Your average appears once results are published.'}</p>
    </Card>
  );
}

function RecentResults({ items }) {
  if (!items.length)
    return (
      <Card>
        <EmptyState icon={Trophy} title="No results yet" description="Scores show up here as soon as your teacher publishes them." className="py-10" />
      </Card>
    );
  return (
    <Card>
      <ul className="divide-y divide-border/70">
        {items.map((a) => (
          <li key={a._id}>
            <Link to={`/results/${a._id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2/50">
              <ScoreRing score={a.myResult.rawMarks} max={a.myResult.maxMarks} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-fg">{a.title}</p>
                <p className="truncate text-xs text-muted">
                  {a.subject?.code} · published {fmtDate(a.myResult.publishedAt, { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StudentDashboard({ assessments, subjects, summary, loading }) {
  const upcoming = upcomingFirst(assessments);
  const next = upcoming.find((a) => a.myAttempts?.activeId) || upcoming.find((a) => ['LIVE', 'AVAILABLE', 'PAUSED'].includes(a.state) && studentActionFor(a)?.kind !== 'submitted');
  const later = upcoming.filter((a) => a !== next).slice(0, 4);
  const results = assessments.filter((a) => a.myResult).sort((x, y) => new Date(y.myResult.publishedAt) - new Date(x.myResult.publishedAt)).slice(0, 5);
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        {next ? <QuizCard a={next} hero className="min-h-[240px] animate-rise-in" /> : <CaughtUpHero />}
        <ProgressCard summary={summary} loading={loading} />
      </div>

      {subjects.length > 0 && (
        <section className="mt-9">
          <SectionTitle
            action={
              <Button size="sm" variant="ghost" to="/subjects">
                View all <ArrowRight />
              </Button>
            }
          >
            Subjects
          </SectionTitle>
          <div className={`grid gap-5 sm:grid-cols-2 ${subjects.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
            {subjects.slice(0, 4).map((s) => (
              <SubjectTile key={s._id} s={s} quizzes={assessments.filter((a) => a.subject?.code === s.code)} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-9 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section>
          <SectionTitle
            action={
              <Button size="sm" variant="ghost" to="/assessments">
                All quizzes <ArrowRight />
              </Button>
            }
          >
            Open & upcoming
          </SectionTitle>
          {later.length ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {later.map((a) => (
                <QuizCard key={a._id} a={a} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon={ClipboardList} title="Nothing else scheduled" description="New quizzes from your subjects will appear here." className="py-10" />
            </Card>
          )}
        </section>
        <section>
          <SectionTitle>Recent results</SectionTitle>
          <RecentResults items={results} />
        </section>
      </div>
    </>
  );
}

function SubjectsPanel({ subjects }) {
  return (
    <Card>
      <CardHeader title="My subjects" description="Allocated this academic year" actions={<Button size="sm" variant="ghost" to="/subjects">View all</Button>} />
      {subjects.length ? (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {subjects.slice(0, 4).map((s) => (
            <SubjectCard key={s._id} subject={s} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="No subjects allocated yet" description="Your administrator assigns subjects each semester." />
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { data: assessments } = useApi('/assessments', { initial: [] });
  const { data: subjects } = useApi(isAdmin ? null : '/subjects', { initial: [] });
  const { data: summary, loading } = useApi(isAdmin ? null : '/dashboard/summary');
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), []);
  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={user.role === 'student' ? 'Ready for your next quiz? Here is everything at a glance.' : "Here's your academic activity at a glance."}
      />
      {isAdmin ? (
        <AdminDashboard assessments={assessments} />
      ) : user.role === 'teacher' ? (
        <TeacherDashboard assessments={assessments} subjects={subjects} summary={summary} loading={loading} />
      ) : (
        <StudentDashboard assessments={assessments} subjects={subjects} summary={summary} loading={loading} />
      )}
    </>
  );
}
