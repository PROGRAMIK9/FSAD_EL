import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { BookOpen, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ElectiveAdminCard, ElectivePrompt } from '../../components/domain/ElectiveChooser.jsx';
import { Button, Card, EmptyState, Field, Input, Modal, MultiPicker, PageHeader, Select, Skeleton } from '../../components/ui/index.js';
import { SubjectCard } from '../../components/domain/SubjectCard.jsx';

function SubjectModal({ departments, years, onClose, onSaved }) {
  const activeYear = years.find((y) => y.isActive)?.label;
  const { register, handleSubmit, formState } = useForm({ defaultValues: { semester: 1, credits: 3, academicYear: activeYear || '' } });
  const submit = handleSubmit(async (f) => {
    try {
      await api.post('/admin/subjects', { ...f, code: f.code.toUpperCase() });
      toast.success('Subject created');
      onSaved();
    } catch (err) {
      toast.error(String(err));
    }
  });
  return (
    <Modal
      title="Create subject"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={formState.isSubmitting}>
            Create subject
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Subject name" required className="sm:col-span-2" placeholder="Data Structures and Algorithms" {...register('name', { required: true })} data-autofocus />
        <Input label="Subject code" required placeholder="CS301" className="uppercase" {...register('code', { required: true })} />
        <Select label="Department" required {...register('department', { required: true })}>
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.code} · {d.name}
            </option>
          ))}
        </Select>
        <Input label="Semester" type="number" min={1} max={12} required {...register('semester', { required: true })} />
        <Input label="Credits" type="number" min={0} max={10} {...register('credits')} />
        {years.length ? (
          <Select label="Academic year" required className="sm:col-span-2" {...register('academicYear', { required: true })}>
            {years.map((y) => (
              <option key={y._id} value={y.label}>
                {y.label}
                {y.isActive ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        ) : (
          <Input label="Academic year" required className="sm:col-span-2" placeholder="2026-27" {...register('academicYear', { required: true })} />
        )}
      </div>
    </Modal>
  );
}

function AllocationModal({ subject, onClose, onSaved }) {
  const teachers = useApi('/admin/users?role=teacher&limit=100&status=active', { initial: { rows: [] } });
  const students = useApi('/admin/users?role=student&limit=100', { initial: { rows: [] } });
  const [teacherIds, setTeacherIds] = useState((subject.teachers || []).map((t) => String(t._id || t)));
  const [studentIds, setStudentIds] = useState((subject.students || []).map((s) => String(s._id || s)));
  const [coordinator, setCoordinator] = useState(String(subject.coordinator?._id || subject.coordinator || ''));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (coordinator && !teacherIds.includes(coordinator)) setCoordinator('');
  }, [teacherIds, coordinator]);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/subjects/${subject._id}/allocations`, { teachers: teacherIds, students: studentIds, coordinator: coordinator || undefined });
      toast.success('Allocations updated');
      onSaved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const teacherOptions = (teachers.data?.rows || []).map((t) => ({ value: t._id, label: t.name, sub: t.email }));
  const studentOptions = (students.data?.rows || []).map((s) => ({ value: s._id, label: s.name, sub: s.usn || s.email }));

  return (
    <Modal
      size="lg"
      title={`Allocate ${subject.code}`}
      description={subject.name}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save allocations
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Teachers">{teachers.loading ? <Skeleton className="h-40" /> : <MultiPicker options={teacherOptions} value={teacherIds} onChange={setTeacherIds} placeholder="Search teachers" />}</Field>
          <Select label="Subject coordinator" value={coordinator} onChange={(e) => setCoordinator(e.target.value)} hint="Must be one of the allocated teachers.">
            <option value="">No coordinator</option>
            {teacherOptions
              .filter((t) => teacherIds.includes(t.value))
              .map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
          </Select>
        </div>
        <Field label="Students">{students.loading ? <Skeleton className="h-64" /> : <MultiPicker options={studentOptions} value={studentIds} onChange={setStudentIds} placeholder="Search name or USN" height="max-h-72" />}</Field>
      </div>
    </Modal>
  );
}

export default function Subjects() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { data: subjects, loading, reload } = useApi('/subjects', { initial: [] });
  const departments = useApi(isAdmin ? '/admin/departments' : null, { initial: [] });
  const years = useApi(isAdmin ? '/admin/academic-years' : null, { initial: [] });
  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState(null);
  const [query, setQuery] = useState('');
  const [semester, setSemester] = useState('');

  const semesters = useMemo(() => [...new Set(subjects.map((s) => s.semester))].sort((a, b) => a - b), [subjects]);
  const filtered = subjects.filter((s) => (!semester || String(s.semester) === semester) && `${s.code} ${s.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Subjects"
        description={isAdmin ? 'Academic subjects and their teacher and student allocations.' : 'Subjects allocated to you this academic year.'}
        actions={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Create subject
            </Button>
          )
        }
      />
      {isAdmin ? <ElectiveAdminCard /> : user.role === 'student' && <ElectivePrompt compact onChosen={reload} />}
      {subjects.length > 3 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-9" placeholder="Search code or name" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="input w-auto" value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semester">
            <option value="">All semesters</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {loading && !subjects.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((s) => (
            <SubjectCard key={s._id} subject={s} onAllocate={isAdmin ? () => setAllocating(s) : undefined} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={BookOpen} title={subjects.length ? 'No subjects match your filters' : 'No subjects yet'} description={isAdmin ? 'Create a subject, then allocate teachers and students.' : 'Your administrator allocates subjects each semester.'} />
        </Card>
      )}
      {creating && (
        <SubjectModal
          departments={departments.data}
          years={years.data}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {allocating && (
        <AllocationModal
          subject={allocating}
          onClose={() => setAllocating(null)}
          onSaved={() => {
            setAllocating(null);
            reload();
          }}
        />
      )}
    </>
  );
}
