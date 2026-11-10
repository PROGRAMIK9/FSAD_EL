import { useState } from 'react';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { Building2, CalendarRange, Layers, Plus, Rows3 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Button, Card, DataTable, Input, Modal, PageHeader, Select, Switch, Tabs } from '../../components/ui/index.js';
import { fmtDate } from '../../lib/format.js';

const KINDS = {
  departments: { label: 'Departments', single: 'department', path: '/admin/departments', icon: Building2 },
  years: { label: 'Academic years', single: 'academic year', path: '/admin/academic-years', icon: CalendarRange },
  semesters: { label: 'Semesters', single: 'semester', path: '/admin/semesters', icon: Layers },
  sections: { label: 'Sections', single: 'section', path: '/admin/sections', icon: Rows3 },
};

const COLUMNS = {
  departments: [
    { key: 'name', label: 'Department', sortable: true },
    { key: 'code', label: 'Code', sortable: true, render: (r) => <Badge tone="primary" className="font-mono">{r.code}</Badge> },
    { key: 'isActive', label: 'Status', render: (r) => (r.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Inactive</Badge>) },
  ],
  years: [
    { key: 'label', label: 'Academic year', sortable: true, render: (r) => <span className="font-semibold">{r.label}</span> },
    { key: 'startsAt', label: 'Starts', render: (r) => fmtDate(r.startsAt) },
    { key: 'endsAt', label: 'Ends', render: (r) => fmtDate(r.endsAt) },
    { key: 'isActive', label: 'Status', render: (r) => (r.isActive ? <Badge tone="success" dot>Current</Badge> : <Badge>Inactive</Badge>) },
  ],
  semesters: [
    { key: 'number', label: 'Semester', sortable: true, render: (r) => r.name || `Semester ${r.number}` },
    { key: 'year', label: 'Academic year', render: (r) => r.academicYear?.label || '—' },
    { key: 'startsAt', label: 'Starts', render: (r) => fmtDate(r.startsAt) },
    { key: 'endsAt', label: 'Ends', render: (r) => fmtDate(r.endsAt) },
  ],
  sections: [
    { key: 'name', label: 'Section', sortable: true, render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'department', label: 'Department', render: (r) => r.department?.code || '—' },
    { key: 'year', label: 'Year', render: (r) => r.academicYear?.label || '—' },
    { key: 'semester', label: 'Semester', render: (r) => r.semester?.number || '—' },
  ],
};

function StructureModal({ kind, departments, years, semesters, onClose, onSaved }) {
  const { register, handleSubmit, watch, setValue, formState } = useForm({ defaultValues: { isActive: false, number: 1 } });
  const yearId = watch('academicYear');
  const date = (v) => (v ? new Date(v) : undefined);

  const submit = handleSubmit(async (f) => {
    const bodies = {
      departments: { name: f.name, code: f.code?.toUpperCase() },
      years: { label: f.label, startsAt: date(f.startsAt), endsAt: date(f.endsAt), isActive: f.isActive },
      semesters: { academicYear: f.academicYear, number: Number(f.number), name: f.name || undefined, startsAt: date(f.startsAt), endsAt: date(f.endsAt) },
      sections: { name: f.name, department: f.department, academicYear: f.academicYear, semester: f.semester },
    };
    try {
      await api.post(KINDS[kind].path, bodies[kind]);
      toast.success(`${KINDS[kind].single[0].toUpperCase()}${KINDS[kind].single.slice(1)} created`);
      onSaved();
    } catch (err) {
      toast.error(String(err));
    }
  });

  const dates = (
    <>
      <Input label="Starts on" type="date" {...register('startsAt')} />
      <Input label="Ends on" type="date" {...register('endsAt')} />
    </>
  );

  return (
    <Modal
      title={`Add ${KINDS[kind].single}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={formState.isSubmitting}>
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === 'departments' && (
          <>
            <Input label="Department name" required className="sm:col-span-2" placeholder="Computer Science and Engineering" {...register('name', { required: true })} data-autofocus />
            <Input label="Code" required placeholder="CSE" className="uppercase" {...register('code', { required: true })} />
          </>
        )}
        {kind === 'years' && (
          <>
            <Input label="Year label" required className="sm:col-span-2" placeholder="2026-27" {...register('label', { required: true })} data-autofocus />
            {dates}
            <div className="rounded-lg border border-border p-3 sm:col-span-2">
              <Switch label="Current academic year" description="Marks every other year inactive." checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} />
            </div>
          </>
        )}
        {kind === 'semesters' && (
          <>
            <Select label="Academic year" required {...register('academicYear', { required: true })}>
              <option value="">Select year</option>
              {years.map((y) => (
                <option key={y._id} value={y._id}>
                  {y.label}
                </option>
              ))}
            </Select>
            <Input label="Semester number" type="number" min={1} max={12} required {...register('number', { required: true })} />
            <Input label="Display name" className="sm:col-span-2" placeholder="Odd semester 2026" {...register('name')} />
            {dates}
          </>
        )}
        {kind === 'sections' && (
          <>
            <Select label="Department" required {...register('department', { required: true })}>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </Select>
            <Select label="Academic year" required {...register('academicYear', { required: true })}>
              <option value="">Select year</option>
              {years.map((y) => (
                <option key={y._id} value={y._id}>
                  {y.label}
                </option>
              ))}
            </Select>
            <Select label="Semester" required disabled={!yearId} hint={!yearId ? 'Choose a year first' : undefined} {...register('semester', { required: true })}>
              <option value="">Select semester</option>
              {semesters
                .filter((s) => (s.academicYear?._id || s.academicYear) === yearId)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || `Semester ${s.number}`}
                  </option>
                ))}
            </Select>
            <Input label="Section name" required placeholder="A" {...register('name', { required: true })} />
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Structure() {
  const [kind, setKind] = useState('departments');
  const [open, setOpen] = useState(false);
  const departments = useApi('/admin/departments', { initial: [] });
  const years = useApi('/admin/academic-years', { initial: [] });
  const semesters = useApi('/admin/semesters', { initial: [] });
  const sections = useApi('/admin/sections', { initial: [] });
  const sources = { departments, years, semesters, sections };
  const current = sources[kind];

  return (
    <>
      <PageHeader
        title="Academic structure"
        description="Departments, academic years, semesters and sections."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            Add {KINDS[kind].single}
          </Button>
        }
      />
      <Tabs className="mb-4" value={kind} onChange={setKind} items={Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label, icon: k.icon, count: sources[value].data?.length }))} />
      <Card>
        <DataTable columns={COLUMNS[kind]} rows={current.data || []} loading={current.loading} emptyIcon={KINDS[kind].icon} empty={`No ${KINDS[kind].label.toLowerCase()} yet.`} />
      </Card>
      {open && (
        <StructureModal
          kind={kind}
          departments={departments.data}
          years={years.data}
          semesters={semesters.data}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            current.reload();
          }}
        />
      )}
    </>
  );
}
