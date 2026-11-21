import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, Skeleton } from '../../components/ui/index.js';
import { CodeWorkspace } from '../../components/domain/CodeWorkspace.jsx';

const difficultyTone = { easy: 'success', medium: 'warn', hard: 'danger' };

/** One practice problem: statement on the left, editor and tests on the right. */
export default function PracticeProblem() {
  const { id } = useParams();
  const { data: q, loading, error } = useApi(`/practice/questions/${id}`);
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !q)
    return (
      <Alert tone="danger" title="Problem not available">
        {error}
        <div className="mt-3">
          <Button to="/practice">Back to practice</Button>
        </div>
      </Alert>
    );
  const statement = (
    <Card className="p-5 lg:sticky lg:top-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="primary">{q.subject.code}</Badge>
        {q.difficulty && <Badge tone={difficultyTone[q.difficulty]}>{q.difficulty}</Badge>}
        {q.topic && <span className="text-muted">{q.topic}</span>}
      </div>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{q.text}</p>
    </Card>
  );
  return (
    <div>
      <Button variant="ghost" size="sm" icon={ArrowLeft} to="/practice" className="mb-4">
        Practice
      </Button>
      <CodeWorkspace key={q.id} question={q} value={q.lastCode} statement={statement} layout="split" />
    </div>
  );
}
