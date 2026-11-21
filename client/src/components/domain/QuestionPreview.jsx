import { Badge } from '../ui/index.js';

const difficultyTone = { easy: 'success', medium: 'warn', hard: 'danger' };

/** Read-only rendering of a question, optionally highlighting the correct answer. */
export function QuestionPreview({ question: q, index, showAnswer = false, compact = false }) {
  return (
    <div className={compact ? '' : 'rounded-2xl border border-border/80 bg-surface p-5 shadow-card'}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {index !== undefined && <span className="rounded-full bg-ink px-2 py-0.5 font-display text-[11px] font-semibold text-ink-fg">Q{index + 1}</span>}
        <Badge tone="primary">{q.type === 'single' ? 'MCQ' : q.type === 'code' ? 'Coding' : 'Fill in'}</Badge>
        <Badge>
          {q.marks} mark{q.marks === 1 ? '' : 's'}
        </Badge>
        {q.difficulty && <Badge tone={difficultyTone[q.difficulty]}>{q.difficulty}</Badge>}
        {q.topic && <span className="text-muted">{q.topic}</span>}
      </div>
      <p className="whitespace-pre-wrap font-display font-medium text-fg">{q.text || <span className="text-subtle">Question text…</span>}</p>
      {q.type === 'code' ? (
        <div className="mt-3 space-y-1 text-sm text-muted">
          <p>{(q.code?.languages || []).map((l) => ({ c: 'C', cpp: 'C++', java: 'Java', python: 'Python' })[l] || l).join(' · ') || 'No languages'}</p>
          {q.code?.testCases ? (
            <p>
              {q.code.testCases.filter((t) => !t.hidden).length} sample · {q.code.testCases.filter((t) => t.hidden).length} hidden test{q.code.testCases.filter((t) => t.hidden).length === 1 ? '' : 's'}
            </p>
          ) : null}
          {q.code?.practice && <Badge tone="info">Practice</Badge>}
        </div>
      ) : q.type === 'single' ? (
        <ul className="mt-3 space-y-1.5">
          {(q.options || []).map((o) => {
            const correct = showAnswer && o.key === q.correctAnswer;
            return (
              <li key={o.key} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${correct ? 'border-success/40 bg-success-soft text-fg' : 'border-border'}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold ${correct ? 'bg-success text-white' : 'bg-surface-2 text-muted'}`}>{o.key}</span>
                <span className="min-w-0">{o.text || <span className="text-subtle">Option text…</span>}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3">
          <div className="input pointer-events-none text-subtle">Type your answer</div>
          {showAnswer && q.correctAnswer && (
            <p className="mt-2 text-sm text-success">
              Accepted: <b>{q.correctAnswer}</b> <span className="text-xs text-muted">(case and outer spaces ignored)</span>
            </p>
          )}
        </div>
      )}
      {showAnswer && q.explanation && <p className="mt-3 border-t border-border pt-3 text-sm text-muted">{q.explanation}</p>}
    </div>
  );
}
