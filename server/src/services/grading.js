export function sameAnswer(actual, expected) {
  if (Array.isArray(actual) && Array.isArray(expected))
    return (
      actual.length === expected.length &&
      [...actual].sort().every((value, index) => value === [...expected].sort()[index])
    );
  return (
    String(actual ?? '')
      .trim()
      .toLowerCase() ===
    String(expected ?? '')
      .trim()
      .toLowerCase()
  );
}
const isBlank = (v) =>
  v === undefined || v === null || (Array.isArray(v) ? !v.length : String(v).trim() === '');

/** What a student may see of a code run: hidden tests keep their verdict but not their I/O. */
export function publicRunResults(results = [], { showHidden = false } = {}) {
  return results.map((r) => {
    const out = {
      index: r.index,
      custom: r.custom,
      hidden: r.hidden,
      status: r.status,
      passed: r.passed,
      timeMs: r.timeMs,
      memoryKb: r.memoryKb,
      weight: r.weight,
    };
    if (showHidden || !r.hidden)
      Object.assign(out, { stdout: r.stdout, stderr: r.stderr, compileOutput: r.compileOutput });
    else if (r.status === 'CE') out.compileOutput = r.compileOutput;
    return out;
  });
}

function reviewCode(q, answer, run, { showHidden }) {
  const value = answer?.value;
  const given = value && typeof value.source === 'string' && value.source.trim() ? value : null;
  const tests = q.code?.testCases || [];
  const awarded = given && run?.status === 'done' ? run.score || 0 : 0;
  let status = 'skipped';
  if (given) {
    if (!run || run.status === 'queued' || run.status === 'running') status = 'pending';
    else if (run.totalWeight && run.passedWeight === run.totalWeight) status = 'correct';
    else if (run.passedWeight > 0) status = 'partial';
    else status = 'incorrect';
  }
  return {
    id: String(q._id),
    text: q.text,
    type: q.type,
    options: [],
    marks: q.marks,
    topic: q.topic,
    difficulty: q.difficulty,
    explanation: q.explanation,
    given,
    status,
    awarded,
    flagged: Boolean(answer?.flagged),
    code: {
      samples: tests
        .map((t, index) => ({ index, input: t.input, expectedOutput: t.expectedOutput, hidden: t.hidden }))
        .filter((t) => showHidden || !t.hidden),
      results: publicRunResults(run?.results, { showHidden }),
      passedWeight: run?.passedWeight ?? null,
      totalWeight: run?.totalWeight ?? null,
      runStatus: run?.status ?? null,
    },
  };
}

/**
 * Per-question breakdown for result review, in the order of `questions`.
 * Each item is `correct`, `incorrect`, `partial`, `pending` or `skipped` and carries the marks
 * awarded. `codeRuns` are the attempt's final CodeRun documents.
 */
export function reviewAnswers(questions, answers = [], codeRuns = [], { showHidden = false } = {}) {
  const runFor = new Map(codeRuns.map((r) => [String(r.question), r]));
  return questions.map((q) => {
    const answer = answers.find((item) => String(item.question) === String(q._id));
    if (q.type === 'code') return reviewCode(q, answer, runFor.get(String(q._id)), { showHidden });
    const given = isBlank(answer?.value) ? null : answer.value;
    const right = given !== null && sameAnswer(given, q.correctAnswer);
    return {
      id: String(q._id),
      text: q.text,
      type: q.type,
      options: (q.options || []).map(({ key, text }) => ({ key, text })),
      marks: q.marks,
      topic: q.topic,
      difficulty: q.difficulty,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      given,
      status: given === null ? 'skipped' : right ? 'correct' : 'incorrect',
      awarded: right ? q.marks : 0,
      flagged: Boolean(answer?.flagged),
    };
  });
}

export function evaluateObjective(questions, answers) {
  let score = 0;
  for (const question of questions) {
    if (question.type === 'code') continue;
    const answer = answers.find((item) => String(item.question) === String(question._id));
    if (answer && sameAnswer(answer.value, question.correctAnswer)) score += question.marks;
  }
  return { objectiveScore: score };
}
