import { Spinner } from '../ui/index.js';

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-muted">
      <Spinner /> {label}
    </div>
  );
}
