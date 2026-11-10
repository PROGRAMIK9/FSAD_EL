import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, BookOpen, ClipboardCheck, ClipboardList, GraduationCap, Inbox, MessageSquareWarning, NotebookPen, PenLine, Plus, Radio, Trophy, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useThemeColors } from '../../hooks/useThemeColors.js';
import { Button, Card, CardHeader, DataTable, EmptyState, PageHeader, StatCard } from '../../components/ui/index.js';
import { AssessmentList } from '../../components/domain/AssessmentList.jsx';
import { SubjectCard } from '../../components/domain/SubjectCard.jsx';
import { fmtDateTime, greeting, humanize } from '../../lib/format.js';

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
          <CardHeader title="Academic performance" description="Average score of published results" />
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

function StudentDashboard({ assessments, subjects, summary, loading }) {
  const upcoming = upcomingFirst(assessments);
  const live = upcoming.filter((a) => ['LIVE', 'AVAILABLE'].includes(a.state));
  return (
    <>
      {live.length > 0 && (
        <Card className="mb-6 border-success/40 bg-success-soft/40">
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">{live.length === 1 ? `${live[0].title} is open now` : `${live.length} assessments are open now`}</p>
              <p className="text-sm text-muted">Start from the Assessments page. Your progress is saved automatically.</p>
            </div>
            <Button variant="primary" to="/assessments" icon={PenLine}>
              Go to assessments
            </Button>
          </div>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="My subjects" value={summary?.subjects} icon={BookOpen} />
        <StatCard loading={loading} label="Upcoming assessments" value={summary?.upcoming} icon={ClipboardList} tone="info" />
        <StatCard loading={loading} label="Average score" value={summary?.averagePercent != null ? `${summary.averagePercent}%` : '—'} hint={`${summary?.publishedGrades ?? 0} published results`} icon={Trophy} tone="success" />
        <StatCard loading={loading} label="Assignments due" value={summary?.pendingAssignments} hint="Not yet submitted" icon={NotebookPen} tone="warn" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Assessment schedule" description="What's coming up" actions={<Button size="sm" variant="ghost" to="/assessments" icon={ArrowRight} />} />
          <AssessmentList items={upcoming.slice(0, 6)} empty="Nothing scheduled. Enjoy the break!" />
        </Card>
        <SubjectsPanel subjects={subjects} />
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
      <PageHeader eyebrow={today} title={`${greeting()}, ${user.name.split(' ')[0]}`} description="Here's your academic activity at a glance." />
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
