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
export function evaluateObjective(questions, answers) {
  let score = 0;
  for (const question of questions) {
    const answer = answers.find((item) => String(item.question) === String(question._id));
    if (answer && sameAnswer(answer.value, question.correctAnswer)) score += question.marks;
  }
  return { objectiveScore: score };
}
