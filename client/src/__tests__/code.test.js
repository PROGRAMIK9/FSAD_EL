import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/socket.js', () => ({ getSocket: () => ({ on() {}, off() {} }) }));

const { blockedShortcut, createCodeClipboard, inCodeEditor } = await import('../hooks/useProctoring.js');
const { summarize, starterFor, verdictOf } = await import('../lib/code.js');
const { fromQuestion, questionFormSchema, toQuestionPayload } = await import('../lib/schemas.js');

const editorWith = () => {
  const host = document.createElement('div');
  host.setAttribute('data-code-editor', '');
  const inner = document.createElement('div');
  host.appendChild(inner);
  document.body.appendChild(host);
  return inner;
};

describe('exam clipboard rules for code', () => {
  const policy = { blockClipboard: true, blockContextMenu: true };

  it('allows copy/paste shortcuts inside the code editor only', () => {
    const inside = editorWith();
    const outside = document.createElement('input');
    expect(inCodeEditor(inside)).toBe(true);
    expect(blockedShortcut({ key: 'v', ctrlKey: true, target: inside }, policy)).toBeNull();
    expect(blockedShortcut({ key: 'v', ctrlKey: true, target: outside }, policy)).toBe('Ctrl+V');
    // Print stays blocked everywhere.
    expect(blockedShortcut({ key: 'p', ctrlKey: true, target: inside }, policy)).toBe('Ctrl+P');
  });

  it('pastes only text that was copied from the editor', () => {
    const clip = createCodeClipboard();
    expect(clip.allows('int main() {}')).toBe(false);
    clip.remember('int main() {}\r\n');
    expect(clip.allows('int main() {}')).toBe(true);
    expect(clip.allows('')).toBe(true);
  });
});

describe('code helpers', () => {
  it('summarizes runs', () => {
    expect(summarize({ status: 'done', results: [{ passed: true }, { passed: false }] }).text).toBe(
      '1/2 tests passed',
    );
    expect(summarize({ status: 'done', results: [{ status: 'CE' }] }).text).toBe('Compilation error');
    expect(summarize({ status: 'error' }).tone).toBe('danger');
    expect(verdictOf('TLE').label).toBe('Time limit exceeded');
  });

  it('uses the question starter code before the default template', () => {
    expect(starterFor('python', { python: 'print()' })).toBe('print()');
    expect(starterFor('java')).toMatch(/class Main/);
  });
});

describe('coding question form', () => {
  const values = () => ({
    ...fromQuestion(null, 'subj'),
    type: 'code',
    text: 'Print the sum of two numbers',
    marks: 5,
  });

  it('needs expected outputs and a visible sample', () => {
    const empty = questionFormSchema.safeParse(values());
    expect(empty.success).toBe(false);
    const v = values();
    v.code.testCases = [{ input: '1 2', expectedOutput: '3', weight: 1, hidden: true }];
    const r = questionFormSchema.safeParse(v);
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => /visible/.test(i.message))).toBe(true);
  });

  it('builds the API payload, keeping starter code only for allowed languages', () => {
    const v = values();
    v.code.languages = ['python'];
    v.code.starter = { python: 'x = 1', c: 'int main(){}' };
    v.code.testCases = [{ input: '1 2', expectedOutput: '3', weight: '2', hidden: false }];
    expect(questionFormSchema.safeParse(v).success).toBe(true);
    const p = toQuestionPayload(v);
    expect(p.type).toBe('code');
    expect(p.code.starter).toEqual({ python: 'x = 1' });
    expect(p.code.testCases[0].weight).toBe(2);
    expect(p.correctAnswer).toBeUndefined();
    const back = fromQuestion({ ...p, subject: 'subj' });
    expect(back.code.languages).toEqual(['python']);
  });
});
