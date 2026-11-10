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
              className={`flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left ${clickable ? 'hover:bg-surface-2' : 'cursor-default'}`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                  done ? 'bg-primary text-primary-fg' : active ? 'bg-primary-soft text-primary ring-2 ring-primary' : 'bg-surface-2 text-subtle'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden min-w-0 md:block">
                <span className={`block truncate text-sm font-semibold ${active || done ? 'text-fg' : 'text-subtle'}`}>{step.label}</span>
                {step.description && <span className="block truncate text-xs text-subtle">{step.description}</span>}
              </span>
            </button>
            {i < steps.length - 1 && <span className={`h-px min-w-4 flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
