import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileJson } from 'lucide-react';
import { api } from '../../lib/api.js';
import { parseQuestionFile, questionLabel } from '../../lib/question-io.js';
import { Alert, Badge, Button, Modal, Select } from '../../components/ui/index.js';

const TYPE_LABEL = { single: 'MCQ', fill_blank: 'Fill in', code: 'Coding' };

/** Imports questions exported from this app (or written by hand) into a subject. */
export function ImportQuestionsModal({ subjects, defaultSubject, onClose, onImported }) {
  const fileRef = useRef(null);
  const [subject, setSubject] = useState(defaultSubject || subjects[0]?._id || '');
  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  const read = async (f) => {
    if (!f) return;
    setErrors([]);
    try {
      const list = parseQuestionFile(await f.text());
      if (!list.length) throw new Error('The file has no questions');
      if (list.length > 100) throw new Error('Import at most 100 questions at a time');
      setFile(f.name);
      setQuestions(list);
    } catch (err) {
      setFile(null);
      setQuestions([]);
      toast.error(err.message);
    }
  };

  const submit = async () => {
    setBusy(true);
    setErrors([]);
    try {
      // Accept 4xx so the per-question errors ({ data: { errors: [{ index, error }] } }) come back.
      const res = await api.post('/questions/bulk', { subject, questions }, { validateStatus: (s) => s < 500 });
      if (res?.imported) {
        toast.success(`${res.imported} question${res.imported === 1 ? '' : 's'} imported`);
        onImported();
      } else if (res?.errors?.length) {
        setErrors(res.errors);
        toast.error(`${res.errors.length} question${res.errors.length === 1 ? ' needs' : 's need'} fixing`);
      } else toast.error('Import failed. Check the file and the subject.');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import questions"
      description="From a JSON file exported here (Question bank → Export) or written by hand. See docs/QUESTION_FORMAT.md."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!questions.length || !subject} onClick={submit}>
            Import {questions.length || ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Into subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => (
            <option key={s._id} value={s._id}>
              {s.code} · {s.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => read(e.target.files?.[0])} data-testid="questions-file" />
          <Button icon={FileJson} onClick={() => fileRef.current?.click()}>
            Choose JSON file
          </Button>
          {file && <span className="truncate text-sm text-muted">{file}</span>}
        </div>
        {errors.length > 0 && (
          <Alert tone="danger" title="Some questions need fixing">
            <ul className="list-disc pl-5">
              {errors.slice(0, 8).map((e) => (
                <li key={e.index}>
                  #{e.index + 1}: {e.error}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {questions.length > 0 && (
          <ul className="max-h-72 divide-y divide-border overflow-auto rounded-2xl border border-border">
            {questions.map((q, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-right text-xs text-subtle">{i + 1}</span>
                <Badge tone="primary">{TYPE_LABEL[q.type] || q.type}</Badge>
                {q.code?.mode === 'function' && <Badge tone="info">Function</Badge>}
                <span className="min-w-0 flex-1 truncate">{questionLabel(q)}</span>
                <span className="text-xs text-muted">{q.marks} mk</span>
                {q.type === 'code' && <span className="text-xs text-muted">{q.code?.testCases?.length || 0} tests</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
