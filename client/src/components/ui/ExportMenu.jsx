import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { API_BASE } from '../../lib/api.js';
import { Button } from './Button.jsx';

const FORMATS = [
  { ext: 'xlsx', label: 'Excel workbook', hint: '.xlsx · results, per-question marks, summary', icon: FileSpreadsheet },
  { ext: 'csv', label: 'CSV', hint: '.csv · opens in any spreadsheet app', icon: FileText },
];

const fileNameFrom = (res, fallback) => /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') || '')?.[1] || fallback;

/**
 * Download menu for tabular exports. `path` is the API path without the
 * extension, e.g. `/assessments/123/results` → `/assessments/123/results.xlsx`.
 */
export function ExportMenu({ path, label = 'Export', size, variant = 'secondary', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const download = async (ext) => {
    setBusy(ext);
    try {
      const res = await fetch(`${API_BASE}${path}.${ext}`, { credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: fileNameFrom(res, `export.${ext}`) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
      toast.success(`Downloaded ${ext.toUpperCase()}`);
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant={variant} size={size} icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <ChevronDown className={`transition ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div role="menu" className={`absolute top-full z-30 mt-2 w-80 animate-scale-in rounded-2xl border border-border bg-surface p-1.5 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {FORMATS.map(({ ext, label: l, hint, icon: Icon }) => (
            <button
              key={ext}
              role="menuitem"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => download(ext)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-60"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ext === 'xlsx' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary-strong'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{busy === ext ? 'Preparing…' : l}</span>
                <span className="block truncate text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
