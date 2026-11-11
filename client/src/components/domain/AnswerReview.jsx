import { useMemo, useState } from 'react';
import { Check, CircleSlash, Lightbulb, X } from 'lucide-react';
import { EmptyState, Tabs } from '../ui/index.js';

const STATUS = {
  correct: { label: 'Correct', chip: 'bg-success-soft text-success', icon: Check },
  incorrect: { label: 'Incorrect', chip: 'bg-danger-soft text-danger', icon: X },
  skipped: { label: 'Skipped', chip: 'bg-surface-2 text-muted', icon: CircleSlash },
};

/** Per-question counts for a review list. */
export const tally = (items = []) => items.reduce((n, i) => ({ ...n, [i.status]: (n[i.status] || 0) + 1 }), { correct: 0, incorrect: 0, skipped: 0 });

function Option({ o, letter, isCorrect, isGiven, perspective }) {
  const tone = isCorrect ? 'bg-success text-white shadow-[0_10px_24px_-14px_rgb(var(--c-success))]' : isGiven ? 'bg-danger text-white shadow-[0_10px_24px_-14px_rgb(var(--c-danger))]' : 'bg-surface ring-1 ring-border text-fg';
  const Icon = isCorrect ? Check : isGiven ? X : null;
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-3 pr-4 ${tone}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl font-display text-xs font-bold ${isCorrect || isGiven ? 'bg-white/95 text-[#0b1220]' : 'bg-surface-2 text-muted'}`}>{letter}</span>
      <span className="min-w-0 flex-1 text-sm font-medium">{o.text}</span>
      {isGiven && <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{perspective === 'student' ? (isCorrect ? 'Your answer' : 'You chose') : 'Chosen'}</span>}
      {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={3} />}
    </li>
  );
}

function ReviewItem({ item, index, perspective }) {
  const st = STATUS[item.status];
  const StIcon = st.icon;
  return (
    <article className="card rounded-3xl p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-ink px-2.5 py-0.5 font-display text-xs font-semibold text-ink-fg">Q{index + 1}</span>
        <span className={`chip ${st.chip}`}>
          <StIcon /> {st.label}
        </span>
        {item.flagged && <span className="chip bg-warn-soft text-warn">Marked for review</span>}
        <span className="ml-auto font-display text-sm font-semibold tabular">
          <span className={item.awarded ? 'text-success' : 'text-muted'}>{item.awarded}</span>
          <span className="text-subtle">/{item.marks} mark{item.marks === 1 ? '' : 's'}</span>
        </span>
      </div>
      <h3 className="whitespace-pre-wrap font-display text-base font-semibold leading-relaxed text-fg">{item.text}</h3>
      {item.type === 'single' ? (
        <ul className="mt-4 space-y-2">
          {item.options.map((o, i) => (
            <Option key={o.key} o={o} letter={String.fromCharCode(65 + i)} isCorrect={o.key === item.correctAnswer} isGiven={o.key === item.given} perspective={perspective} />
          ))}
        </ul>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className={`rounded-2xl p-3.5 ${item.status === 'correct' ? 'bg-success text-white' : item.status === 'incorrect' ? 'bg-danger text-white' : 'bg-surface-2 text-muted'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{perspective === 'student' ? 'Your answer' : 'Answer given'}</p>
            <p className="mt-0.5 font-medium">{item.given ?? 'No answer'}</p>
          </div>
          <div className="rounded-2xl bg-success-soft p-3.5 text-success">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Accepted answer</p>
            <p className="mt-0.5 font-medium">{String(item.correctAnswer ?? '—')}</p>
          </div>
        </div>
      )}
      {item.explanation && (
        <p className="mt-4 flex gap-2.5 rounded-2xl bg-primary-soft p-3.5 text-sm text-fg">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
          <span>{item.explanation}</span>
        </p>
      )}
    </article>
  );
}

/** Filterable list of reviewed questions with correct / incorrect highlighting. */
export function AnswerReview({ items, perspective = 'student' }) {
  const [filter, setFilter] = useState('all');
  const counts = useMemo(() => tally(items), [items]);
  const shown = items.map((item, index) => ({ item, index })).filter(({ item }) => filter === 'all' || item.status === filter);
  return (
    <div>
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'All', count: items.length },
          { value: 'correct', label: 'Correct', count: counts.correct },
          { value: 'incorrect', label: 'Incorrect', count: counts.incorrect },
          { value: 'skipped', label: 'Skipped', count: counts.skipped },
        ]}
      />
      {shown.length ? (
        <div className="space-y-4">
          {shown.map(({ item, index }) => (
            <ReviewItem key={item.id} item={item} index={index} perspective={perspective} />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={Check} title="Nothing in this filter" className="py-10" />
        </div>
      )}
    </div>
  );
}
