import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Alert, Badge, Button, Modal } from '../../components/ui/index.js';

const MAX_BYTES = 950_000;

export function ImportUsersModal({ role, onClose, onImported }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error('CSV file must be under 950 KB');
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await api.post('/admin/users/import/preview', { csv: text }));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const result = await api.post('/admin/users/import', { csv });
      toast.success(`${result.imported} accounts imported`);
      onImported();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={`Import ${role}s from CSV`}
      description="Required columns: name, email, role, departmentCode. Student rows also need usn."
      onClose={onClose}
      footer={
        <>
          <a href="/users-import-template.csv" download className="btn btn-ghost mr-auto">
            <Download /> Template
          </a>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!preview || preview.invalid > 0} loading={busy && Boolean(preview)} onClick={commit}>
            Import {preview?.valid || ''} records
          </Button>
        </>
      }
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${dragging ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-surface-2/50'}`}
      >
        {fileName ? <FileSpreadsheet className="mb-2 h-8 w-8 text-primary" /> : <UploadCloud className="mb-2 h-8 w-8 text-subtle" />}
        <p className="font-semibold">{fileName || 'Drop a CSV file here or click to browse'}</p>
        <p className="mt-1 text-xs text-muted">Up to 950 KB. Every row is validated before anything is saved.</p>
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />

      {preview && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">
              <CheckCircle2 className="h-3.5 w-3.5" /> {preview.valid} valid
            </Badge>
            <Badge tone={preview.invalid ? 'danger' : 'neutral'}>
              <XCircle className="h-3.5 w-3.5" /> {preview.invalid} with problems
            </Badge>
            <Badge>{preview.total} rows</Badge>
          </div>
          {preview.errors.length > 0 && (
            <Alert tone="danger" title="Fix these rows and upload again">
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                {preview.errors.map((issue, i) => (
                  <li key={`${issue.line}-${i}`}>
                    <b>Row {issue.line}:</b> {issue.errors.join(', ')}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {preview.preview?.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-lg border border-border">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>USN</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 50).map((r) => (
                    <tr key={r.email}>
                      <td>{r.name}</td>
                      <td className="text-muted">{r.email}</td>
                      <td>{r.role}</td>
                      <td className="font-mono text-xs">{r.usn || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
