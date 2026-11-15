/**
 * CIE (theory) for the RVCE 2024 scheme:
 *   Quizzes 20 = Quiz 1 (10) + Quiz 2 (10)
 *   Tests   40 = (Test 1 + Test 2, each out of 50) reduced to 40
 *   EL      40 = Phase I (20) + Phase II (20)
 *   CIE    100 = quizzes + tests + EL
 * Integrated-lab courses add CIE lab 50 = experiments & record (40) + lab test (10).
 * A student must score at least 50% in quizzes and tests together (30 of 60) to clear CIE.
 */
export const CIE_FIELDS = {
  test1: 50,
  test2: 50,
  el1: 20,
  el2: 20,
  labRecord: 40,
  labTest: 10,
};
export const CIE_PASS_MARK = 30;

const round1 = (n) => Math.round(n * 10) / 10;
const has = (v) => typeof v === 'number' && !Number.isNaN(v);
const sum = (...values) => (values.every(has) ? values.reduce((a, b) => a + b, 0) : null);

/** Computes the CIE totals. Missing components give null totals and are listed in `missing`. */
export function computeCie(
  { quiz1, quiz2, test1, test2, el1, el2, labRecord, labTest } = {},
  { hasLab = false } = {},
) {
  const quizzes = sum(quiz1, quiz2);
  const testRaw = sum(test1, test2);
  const tests = testRaw === null ? null : round1((testRaw / 100) * 40);
  const el = sum(el1, el2);
  const total = quizzes !== null && tests !== null && el !== null ? round1(quizzes + tests + el) : null;
  const lab = hasLab ? sum(labRecord, labTest) : undefined;
  const missing = Object.entries({
    quiz1,
    quiz2,
    test1,
    test2,
    el1,
    el2,
    ...(hasLab ? { labRecord, labTest } : {}),
  })
    .filter(([, v]) => !has(v))
    .map(([k]) => k);
  const quizAndTests = quizzes !== null && tests !== null ? round1(quizzes + tests) : null;
  return {
    quizzes,
    tests,
    el,
    total,
    ...(hasLab ? { lab } : {}),
    quizAndTests,
    // null while quiz or test marks are still missing
    eligible: quizAndTests === null ? null : quizAndTests >= CIE_PASS_MARK,
    missing,
  };
}
