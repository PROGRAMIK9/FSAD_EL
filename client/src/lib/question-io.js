/** Portable question files: { format: 'rvce-hub/questions@1', questions: [...] }. */
export const QUESTION_FORMAT = 'rvce-hub/questions@1';

/** Reads an export file (or a bare list) into question objects; throws a readable error. */
export function parseQuestionFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON');
  }
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) {
    if (data.format && !String(data.format).startsWith('rvce-hub/questions@')) throw new Error(`Unknown format "${data.format}"`);
    return data.questions;
  }
  throw new Error('Expected { "format": "rvce-hub/questions@1", "questions": [...] }');
}

/** Short label for a question in previews. */
export const questionLabel = (q) => String(q?.text || '').split('\n')[0].replace(/^#+\s*/, '').slice(0, 100) || '(no text)';

/** Starts a browser download of `data` as pretty JSON. */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportFileName = (label = 'questions') =>
  `${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'questions'}-${new Date().toISOString().slice(0, 10)}.json`;
