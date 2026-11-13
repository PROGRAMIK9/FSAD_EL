import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, Copy, FileStack, Lock, Pencil, Plus, ScanText, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton, Tabs, Toolbar } from '../../components/ui/index.js';
import { QuestionPreview } from '../../components/domain/QuestionPreview.jsx';
import { QuestionEditor } from './QuestionEditor.jsx';
import { ImportPaperModal } from './ImportPaperModal.jsx';

export default function QuestionBank() {
  const { data: subjects } = useApi('/subjects', { initial: [] });
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('active');
  const [editor, setEditor] = useState(null); // null | { question?, duplicate? }
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ subject, type, difficulty, search: query, archived: view === 'archived' });
  const { data: questions, loading, reload } = useApi(`/questions?${params}`, { initial: [] });
  const topics = useMemo(() => [...new Set(questions.map((q) => q.topic).filter(Boolean))].sort(), [questions]);
  const bySubject = useMemo(() => new Map(subjects.map((s) => [s._id, s])), [subjects]);

  const archive = async (q, restore = false) => {
    try {
      await api.post(`/questions/${q._id}/archive`, { restore });
      toast.success(restore ? 'Question restored' : 'Question archived');
      reload();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const editorQuestion = editor?.duplicate ? { ...editor.question, _id: undefined, locked: false } : editor?.question;

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Reusable questions for your subjects. Quizzes are assembled from these."
        actions={
          <>
            <Button icon={ScanText} onClick={() => setImporting(true)} disabled={!subjects.length}>
              Import paper
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditor({})} disabled={!subjects.length}>
              New question
            </Button>
          </>
        }
      />
      <Card>
        <Toolbar>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-9" placeholder="Search question text or topic" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.code}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="single">Multiple choice</option>
            <option value="fill_blank">Fill in</option>
          </select>
          <select className="input w-auto" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </Toolbar>
        {loading && !questions.length ? (
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : questions.length ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {questions.map((q) => (
              <div key={q._id} className="flex flex-col rounded-xl border border-border bg-surface">
                <div className="flex-1 p-4">
                  <QuestionPreview question={q} showAnswer compact />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted">
                  <Badge className="font-mono">{bySubject.get(String(q.subject))?.code || '—'}</Badge>
                  {q.usedIn > 0 && <span>Used in {q.usedIn} quiz{q.usedIn === 1 ? '' : 'zes'}</span>}
                  {q.locked && (
                    <span className="inline-flex items-center gap-1 text-warn" title="In a published quiz">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                  <div className="ml-auto flex">
                    {view === 'active' ? (
                      <>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditor({ question: q })} disabled={q.locked} aria-label="Edit" title={q.locked ? 'Locked: used in a published quiz' : 'Edit'} />
                        <Button size="sm" variant="ghost" icon={Copy} onClick={() => setEditor({ question: q, duplicate: true })} aria-label="Duplicate" title="Duplicate" />
                        <Button size="sm" variant="ghost" icon={Archive} onClick={() => archive(q)} aria-label="Archive" title="Archive" />
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" icon={ArchiveRestore} onClick={() => archive(q, true)}>
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileStack}
            title={view === 'archived' ? 'No archived questions' : 'No questions yet'}
            description={view === 'archived' ? undefined : 'Add multiple-choice or fill-in questions, then assemble them into 10-mark quizzes.'}
            action={
              view === 'active' &&
              subjects.length > 0 && (
                <Button variant="primary" icon={Plus} onClick={() => setEditor({})}>
                  Add your first question
                </Button>
              )
            }
          />
        )}
      </Card>
      {importing && (
        <ImportPaperModal
          subjects={subjects}
          defaultSubject={subject || undefined}
          topics={topics}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            reload();
          }}
        />
      )}
      {editor && (
        <Modal size="xl" title={editor.duplicate ? 'Duplicate question' : editor.question ? 'Edit question' : 'New question'} onClose={() => setEditor(null)}>
          <QuestionEditor
            subjects={subjects}
            question={editorQuestion?._id ? editorQuestion : undefined}
            defaultSubject={subject || (editorQuestion ? String(editorQuestion.subject) : undefined)}
            topics={topics}
            onCancel={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              reload();
            }}
            initial={editor.duplicate ? editorQuestion : undefined}
          />
        </Modal>
      )}
    </>
  );
}
