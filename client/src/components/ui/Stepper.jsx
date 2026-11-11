import { Check } from 'lucide-react';

/** steps: [{ label, description? }]; `current` is a 0-based index. */
export function Stepper({ steps, current, onStepClick, maxReachable = current }) {
  return (
    <ol className="flex w-full items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = onStepClick && i <= maxReachable && !active;
        return (
          <li key={step.label} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition ${clickable ? 'hover:bg-surface-2' : 'cursor-default'}`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-xs font-bold transition ${
                  done ? 'bg-primary text-white shadow-hero' : active ? 'bg-ink text-ink-fg ring-4 ring-primary/20' : 'bg-surface-2 text-subtle'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden min-w-0 md:block">
                <span className={`block truncate text-sm font-semibold ${active || done ? 'text-fg' : 'text-subtle'}`}>{step.label}</span>
                {step.description && <span className="block truncate text-xs text-subtle">{step.description}</span>}
              </span>
            </button>
            {i < steps.length - 1 && <span className={`h-1 min-w-4 flex-1 rounded-full ${done ? 'bg-primary' : 'bg-surface-2'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
