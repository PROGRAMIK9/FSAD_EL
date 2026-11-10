import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { Button, Input, Modal, Select, Switch } from '../../components/ui/index.js';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the full name'),
  email: z.string().trim().email('Enter a valid email'),
  usn: z.string().trim().optional(),
  department: z.string().optional(),
  semester: z.union([z.literal(''), z.coerce.number().int().min(1).max(12)]).optional(),
  section: z.string().trim().max(4).optional(),
  isActive: z.boolean(),
});

/** Create (no `user`) or edit (with `user`) a student/teacher account. */
export function UserFormModal({ role, user, departments, onClose, onSaved }) {
  const editing = Boolean(user);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      usn: user?.usn || '',
      department: user?.department?._id || user?.department || '',
      semester: user?.semester ?? '',
      section: user?.section || '',
      isActive: user?.isActive ?? true,
    },
  });

  const submit = handleSubmit(async (values) => {
    const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined));
    if (role === 'student' && body.usn) body.usn = body.usn.toUpperCase();
    try {
      if (editing) await api.patch(`/admin/users/${user._id}`, body);
      else {
        const { isActive, ...rest } = body;
        const created = await api.post('/admin/users', { ...rest, role });
        if (!isActive) await api.patch(`/admin/users/${created.user._id}`, { isActive: false });
      }
      toast.success(editing ? 'Account updated' : 'Account created');
      onSaved();
    } catch (err) {
      toast.error(String(err));
    }
  });

  return (
    <Modal
      title={editing ? `Edit ${user.name}` : `Add ${role}`}
      description={editing ? undefined : 'The person can sign in with Google once their account is active.'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {editing ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" required className="sm:col-span-2" error={errors.name?.message} {...register('name')} data-autofocus />
        <Input label="Institution email" type="email" required className="sm:col-span-2" placeholder="name@rvce.edu.in" error={errors.email?.message} {...register('email')} />
        <Select label="Department" className={role === 'student' ? '' : 'sm:col-span-2'} {...register('department')}>
          <option value="">Not set</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.code} · {d.name}
            </option>
          ))}
        </Select>
        {role === 'student' && (
          <>
            <Input label="USN" placeholder="1RV26CS001" className="uppercase" error={errors.usn?.message} {...register('usn')} />
            <Input label="Semester" type="number" min={1} max={12} error={errors.semester?.message} {...register('semester')} />
            <Input label="Section" placeholder="A" error={errors.section?.message} {...register('section')} />
          </>
        )}
        <div className="rounded-lg border border-border p-3 sm:col-span-2">
          <Switch label="Active account" description="Inactive accounts cannot sign in." checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} />
        </div>
      </div>
    </Modal>
  );
}
