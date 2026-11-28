import { z } from 'zod';
import { MARKER, checkSignature } from './function-drivers.js';

export const QUIZ_MARKS = 10;
export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Form-level schema for the question editor (mirrors server/src/routes/questions.js). */
export const questionFormSchema = z
  .object({
    subject: z.string().min(1, 'Choose a subject'),
    type: z.enum(['single', 'fill_blank', 'code']),
    text: z.string().trim().min(3, 'Write the question (at least 3 characters)').max(10000),
    options: z.array(z.object({ text: z.string().trim().max(500) })).max(8),
    correctIndex: z.coerce.number().int().min(-1),
    answer: z.string().trim().max(200),
    marks: z.coerce
      .number({ invalid_type_error: 'Enter marks' })
      .positive('Marks must be more than 0')
      .max(10, 'At most 10 marks')
      .refine((v) => Number.isInteger(v * 2), 'Use steps of 0.5'),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    topic: z.string().trim().max(80),
    explanation: z.string().trim().max(2000),
    code: z
      .object({
        languages: z.array(z.string()),
        starter: z.record(z.string()),
        timeLimitMs: z.coerce.number({ invalid_type_error: 'Enter a time limit' }).int().min(500, 'At least 500 ms').max(10000, 'At most 10 s'),
        memoryLimitMb: z.coerce.number({ invalid_type_error: 'Enter a memory limit' }).int().min(32, 'At least 32 MB').max(512, 'At most 512 MB'),
        comparison: z.enum(['exact', 'trim', 'tokens']),
        practice: z.boolean(),
        mode: z.enum(['stdio', 'function']),
        signature: z.object({ name: z.string(), params: z.array(z.object({ name: z.string(), type: z.string() })), returns: z.string() }),
        drivers: z.record(z.string()),
        testCases: z
          .array(
            z.object({
              input: z.string().max(1048576, 'Larger than 1 MB'),
              expectedOutput: z.string().max(1048576, 'Larger than 1 MB'),
              weight: z.coerce.number({ invalid_type_error: 'Weight' }).positive('Must be > 0').max(100),
              hidden: z.boolean(),
            }),
          )
          .max(50, 'At most 50 test cases'),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'code' && v.text.length > 2000) ctx.addIssue({ code: 'custom', path: ['text'], message: 'At most 2000 characters' });
    if (v.type === 'code') {
      const c = v.code;
      if (!c?.languages?.length) ctx.addIssue({ code: 'custom', path: ['code', 'languages'], message: 'Allow at least one language' });
      if (!c?.testCases?.length) ctx.addIssue({ code: 'custom', path: ['code', 'testCases'], message: 'Add at least one test case' });
      else if (!c.testCases.some((t) => !t.hidden)) ctx.addIssue({ code: 'custom', path: ['code', 'testCases'], message: 'Keep at least one test visible as a sample' });
      if (c?.mode === 'function') {
        const problems = checkSignature(c.signature);
        if (problems.length) ctx.addIssue({ code: 'custom', path: ['code', 'signature'], message: problems[0] });
        const missing = (c.languages || []).filter((l) => !String(c.drivers?.[l] || '').includes(MARKER));
        if (!problems.length && missing.length) ctx.addIssue({ code: 'custom', path: ['code', 'drivers'], message: `Generate the drivers (missing for ${missing.join(', ')})` });
      }
      c?.testCases?.forEach((t, i) => {
        if (t.expectedOutput === '') ctx.addIssue({ code: 'custom', path: ['code', 'testCases', i, 'expectedOutput'], message: 'Expected output is required' });
      });
    } else if (v.type === 'single') {
      if (v.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two options' });
      v.options.forEach((o, i) => {
        if (!o.text) ctx.addIssue({ code: 'custom', path: ['options', i, 'text'], message: 'Option text is required' });
      });
      const texts = v.options.map((o) => o.text.toLowerCase()).filter(Boolean);
      if (new Set(texts).size !== texts.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different' });
      if (v.correctIndex < 0 || v.correctIndex >= v.options.length) ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Mark the correct option' });
    } else if (!v.answer) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Enter the accepted answer' });
    }
  });

/** Converts editor values into the API payload. */
export function toQuestionPayload(v) {
  const base = { subject: v.subject, type: v.type, text: v.text, marks: Number(v.marks), difficulty: v.difficulty, topic: v.topic || undefined, explanation: v.explanation || undefined };
  if (v.type === 'code') {
    const c = v.code;
    const starter = Object.fromEntries(Object.entries(c.starter || {}).filter(([lang, src]) => c.languages.includes(lang) && src?.trim()));
    return {
      ...base,
      options: [],
      code: {
        languages: c.languages,
        starter,
        timeLimitMs: Number(c.timeLimitMs),
        memoryLimitMb: Number(c.memoryLimitMb),
        comparison: c.comparison,
        practice: Boolean(c.practice),
        mode: c.mode || 'stdio',
        ...(c.mode === 'function'
          ? {
              signature: { name: c.signature.name, params: c.signature.params.map(({ name, type }) => ({ name, type })), returns: c.signature.returns },
              drivers: Object.fromEntries(Object.entries(c.drivers || {}).filter(([lang]) => c.languages.includes(lang))),
            }
          : {}),
        testCases: c.testCases.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput, weight: Number(t.weight) || 1, hidden: Boolean(t.hidden) })),
      },
    };
  }
  if (v.type === 'single') {
    const options = v.options.map((o, i) => ({ key: OPTION_KEYS[i], text: o.text }));
    return { ...base, options, correctAnswer: OPTION_KEYS[v.correctIndex] };
  }
  return { ...base, options: [], correctAnswer: v.answer };
}

export const defaultCode = () => ({
  languages: ['c', 'cpp', 'java', 'python'],
  starter: {},
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  comparison: 'trim',
  practice: false,
  mode: 'stdio',
  signature: defaultSignature(),
  drivers: {},
  testCases: [
    { input: '', expectedOutput: '', weight: 1, hidden: false },
    { input: '', expectedOutput: '', weight: 1, hidden: true },
  ],
});

export const defaultSignature = () => ({ name: 'solve', params: [{ name: 'nums', type: 'int[]' }], returns: 'int' });

function codeValues(code) {
  if (!code?.testCases?.length) return defaultCode();
  return {
    languages: code.languages?.length ? [...code.languages] : defaultCode().languages,
    starter: { ...(code.starter || {}) },
    timeLimitMs: code.timeLimitMs ?? 2000,
    memoryLimitMb: code.memoryLimitMb ?? 256,
    comparison: code.comparison || 'trim',
    practice: Boolean(code.practice),
    mode: code.mode || 'stdio',
    signature: code.signature?.name ? { name: code.signature.name, params: (code.signature.params || []).map(({ name, type }) => ({ name, type })), returns: code.signature.returns } : defaultSignature(),
    drivers: { ...(code.drivers || {}) },
    testCases: code.testCases.map((t) => ({ input: t.input ?? '', expectedOutput: t.expectedOutput ?? '', weight: t.weight ?? 1, hidden: Boolean(t.hidden) })),
  };
}

/** Converts a stored question into editor values. */
export function fromQuestion(q, fallbackSubject = '') {
  if (!q)
    return { subject: fallbackSubject, type: 'single', text: '', options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: -1, answer: '', marks: 1, difficulty: 'medium', topic: '', explanation: '', code: defaultCode() };
  const options = q.type === 'single' ? q.options.map((o) => ({ text: o.text })) : [{ text: '' }, { text: '' }];
  return {
    subject: String(q.subject?._id || q.subject),
    type: q.type,
    text: q.text,
    options,
    correctIndex: q.type === 'single' ? q.options.findIndex((o) => o.key === q.correctAnswer) : -1,
    answer: q.type === 'fill_blank' ? String(q.correctAnswer ?? '') : '',
    marks: q.marks,
    difficulty: q.difficulty || 'medium',
    topic: q.topic || '',
    explanation: q.explanation || '',
    code: codeValues(q.code),
  };
}

export const sumMarks = (questions) => Math.round(questions.reduce((n, q) => n + (Number(q.marks) || 0), 0) * 100) / 100;

export const proctoringDefaults = {
  enabled: true,
  requireFullscreen: true,
  maxViolations: 3,
  blockClipboard: true,
  blockContextMenu: true,
  detectDuplicateTab: true,
  detectDevtools: false,
};

export const proctoringPresets = {
  relaxed: { label: 'Relaxed', description: 'Log events only. Nothing is blocked or auto-submitted.', values: { enabled: true, requireFullscreen: false, maxViolations: 0, blockClipboard: false, blockContextMenu: false, detectDuplicateTab: true, detectDevtools: false } },
  standard: { label: 'Standard', description: 'Fullscreen, copy/paste blocked, auto-submit after 3 warnings.', values: proctoringDefaults },
  strict: { label: 'Strict', description: 'Everything on, auto-submit after the 2nd warning.', values: { enabled: true, requireFullscreen: true, maxViolations: 2, blockClipboard: true, blockContextMenu: true, detectDuplicateTab: true, detectDevtools: true } },
};

/** Quiz builder form (mirrors server/src/routes/assessments.js). Timing rules are checked in superRefine. */
export const quizFormSchema = z
  .object({
    subject: z.string().min(1, 'Choose a subject'),
    title: z.string().trim().min(3, 'Give the quiz a title (3+ characters)').max(160),
    description: z.string().max(4000),
    questionIds: z.array(z.string()).min(1, 'Select at least one question'),
    availabilityMode: z.enum(['scheduled', 'instant', 'room']),
    startsAt: z.string(),
    endsAt: z.string(),
    durationMinutes: z.coerce.number({ invalid_type_error: 'Enter a duration' }).int('Whole minutes only').min(1, 'At least 1 minute').max(600, 'At most 600 minutes'),
    attemptsAllowed: z.coerce.number().int().min(1).max(10),
    category: z.enum(['Quiz', 'Lab', 'Coding test']).default('Quiz'),
    cieSlot: z.enum(['', 'QUIZ1', 'QUIZ2', 'LAB_TEST']).default(''),
    randomizeQuestions: z.boolean(),
    randomizeOptions: z.boolean(),
    proctoring: z.object({
      enabled: z.boolean(),
      requireFullscreen: z.boolean(),
      maxViolations: z.coerce.number().int().min(0, '0 or more').max(20, 'At most 20'),
      blockClipboard: z.boolean(),
      blockContextMenu: z.boolean(),
      detectDuplicateTab: z.boolean(),
      detectDevtools: z.boolean(),
    }),
  })
  .superRefine((v, ctx) => {
    const start = v.startsAt ? new Date(v.startsAt) : null;
    const end = v.endsAt ? new Date(v.endsAt) : null;
    if (v.cieSlot && (v.cieSlot === 'LAB_TEST') !== (v.category !== 'Quiz')) ctx.addIssue({ code: 'custom', path: ['cieSlot'], message: v.category !== 'Quiz' ? 'A lab or coding test can only count as the lab test' : 'Only a lab or coding test can count as the lab test' });
    if (v.category === 'Quiz' && v.durationMinutes !== 20) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'Quizzes must last 20 minutes' });
    if (v.availabilityMode === 'scheduled' && !start) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Scheduled quizzes need an opening time' });
    if (start && end && end <= start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Must be after the opening time' });
    if (end && end <= new Date()) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Closing time is in the past' });
    if (start && end && v.durationMinutes > (end - start) / 60000) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'Longer than the time the quiz is open' });
  });

/**
 * Picks questions from `pool` whose marks add up to exactly `target`
 * (marks are in 0.5 steps, so this is a small subset-sum on half-marks).
 * Returns ids, or null if no combination exists.
 */
export function suggestQuestions(pool, target) {
  const goal = Math.round(target * 2);
  if (goal <= 0) return [];
  const items = pool.map((q) => ({ id: q._id, w: Math.round(q.marks * 2) })).filter((x) => x.w > 0 && x.w <= goal);
  const from = new Array(goal + 1).fill(null);
  from[0] = { prev: -1, item: -1 };
  items.forEach((it, idx) => {
    for (let t = goal; t >= it.w; t--) if (!from[t] && from[t - it.w] && from[t - it.w].item < idx) from[t] = { prev: t - it.w, item: idx };
  });
  if (!from[goal]) return null;
  const ids = [];
  for (let t = goal; t > 0; t = from[t].prev) ids.push(items[from[t].item].id);
  return ids.reverse();
}
