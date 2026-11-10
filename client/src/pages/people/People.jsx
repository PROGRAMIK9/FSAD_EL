import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Upload, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { Avatar, Badge, Button, Card, DataTable, PageHeader, Toolbar } from '../../components/ui/index.js';
import { fmtRelative } from '../../lib/format.js';
import { UserFormModal } from './UserFormModal.jsx';
import { ImportUsersModal } from './ImportUsersModal.jsx';

const LIMIT = 25;

export default function People({ role }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [importing, setImporting] = useState(false);
  const { data: departments } = useApi('/admin/departments', { initial: [] });

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ role, page, limit: LIMIT, search: query, department, status });
  const { data, loading, reload } = useApi(`/admin/users?${params}`, { initial: { rows: [], total: 0 } });
  const pages = Math.max(1, Math.ceil((data?.total || 0) / LIMIT));
  const noun = role === 'student' ? 'Students' : 'Teachers';

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted">{r.email}</p>
          </div>
        </div>
      ),
    },
    role === 'student' && { key: 'usn', label: 'USN', sortable: true, render: (r) => <span className="font-mono text-xs">{r.usn || '—'}</span> },
    { key: 'department', label: 'Department', sortValue: (r) => r.department?.code, sortable: true, render: (r) => r.department?.code || '—' },
    role === 'student' && { key: 'semester', label: 'Sem / Sec', render: (r) => (r.semester ? `${r.semester}${r.section ? ` · ${r.section}` : ''}` : '—') },
    { key: 'lastLoginAt', label: 'Last sign-in', render: (r) => <span className="text-muted">{r.lastLoginAt ? fmtRelative(r.lastLoginAt) : 'Never'}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (r) =>
        r.approvalStatus === 'pending' ? (
          <Badge tone="warn" dot>
            Pending
          </Badge>
        ) : r.isActive ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge dot>Inactive</Badge>
        ),
    },
    { key: 'actions', label: '', align: 'right', render: (r) => <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} /> },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`${noun}`}
        description={`Search, review and manage ${role} accounts.`}
        actions={
          <>
            <Button icon={Upload} onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              Add {role}
            </Button>
          </>
        }
      />
      <Card>
        <Toolbar>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-9" placeholder={`Search name, email${role === 'student' ? ', USN' : ''}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={department} onChange={(e) => (setDepartment(e.target.value), setPage(1))} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.code}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending approval</option>
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.rows || []} loading={loading} emptyIcon={Users} empty={`No ${role} accounts match.`} />
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
          <span>{data?.total ?? 0} accounts</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" />
            <span>
              Page {page} of {pages}
            </span>
            <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" />
          </div>
        </div>
      </Card>
      {editing && (
        <UserFormModal
          role={role}
          user={editing === 'new' ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {importing && (
        <ImportUsersModal
          role={role}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            reload();
          }}
        />
      )}
    </>
  );
}
