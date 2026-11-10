import { z } from 'zod';

export const QUIZ_MARKS = 10;
export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Form-level schema for the question editor (mirrors server/src/routes/questions.js). */
export const questionFormSchema = z
  .object({
    subject: z.string().min(1, 'Choose a subject'),
    type: z.enum(['single', 'fill_blank']),
    text: z.string().trim().min(3, 'Write the question (at least 3 characters)').max(2000),
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
  })
  .superRefine((v, ctx) => {
    if (v.type === 'single') {
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
  if (v.type === 'single') {
    const options = v.options.map((o, i) => ({ key: OPTION_KEYS[i], text: o.text }));
    return { ...base, options, correctAnswer: OPTION_KEYS[v.correctIndex] };
  }
  return { ...base, options: [], correctAnswer: v.answer };
}

/** Converts a stored question into editor values. */
export function fromQuestion(q, fallbackSubject = '') {
  if (!q)
    return { subject: fallbackSubject, type: 'single', text: '', options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: -1, answer: '', marks: 1, difficulty: 'medium', topic: '', explanation: '' };
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
