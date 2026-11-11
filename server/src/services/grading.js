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

/**
 * Per-question breakdown for result review, in the order of `questions`.
 * Each item is `correct`, `incorrect` or `skipped` and carries the marks awarded.
 */
export function reviewAnswers(questions, answers = []) {
  return questions.map((q) => {
    const answer = answers.find((item) => String(item.question) === String(q._id));
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
    const answer = answers.find((item) => String(item.question) === String(question._id));
    if (answer && sameAnswer(answer.value, question.correctAnswer)) score += question.marks;
  }
  return { objectiveScore: score };
}
