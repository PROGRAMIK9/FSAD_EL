import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Skeleton } from '../../components/ui/index.js';
import { CodeWorkspace } from '../../components/domain/CodeWorkspace.jsx';

const difficultyTone = { easy: 'success', medium: 'warn', hard: 'danger' };
const titleOf = (text = '') => text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 120);

/** One practice problem in the full-height workspace: problem | editor over console. */
export default function PracticeProblem() {
  const { id } = useParams();
  const { data: q, loading, error } = useApi(`/practice/questions/${id}`);
  if (loading) return <Skeleton className="h-[70vh] w-full rounded-3xl" />;
  if (error || !q)
    return (
      <Alert tone="danger" title="Problem not available">
        {error}
        <div className="mt-3">
          <Button to="/practice">Back to practice</Button>
        </div>
      </Alert>
    );
  const [first, ...rest] = q.text.split('\n');
  const statement = (
    <article>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="primary">{q.subject.code}</Badge>
        {q.difficulty && <Badge tone={difficultyTone[q.difficulty]}>{q.difficulty}</Badge>}
        {q.topic && <span className="text-muted">{q.topic}</span>}
      </div>
      <h2 className="text-2xl font-bold leading-tight tracking-tight">{first}</h2>
      {rest.length > 0 && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{rest.join('\n').trim()}</p>}
    </article>
  );
  return <CodeWorkspace key={q.id} question={q} value={q.lastCode} statement={statement} title={titleOf(q.text)} backTo="/practice" height="calc(100dvh - 6.5rem)" />;
}
