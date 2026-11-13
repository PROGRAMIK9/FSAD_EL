/**
 * Turns the text of a question paper (read with OCR or from a PDF's text layer) into draft
 * questions for the question bank. Pure and synchronous so it can be unit-tested.
 *
 * Recognised layout:
 *   1. / 1) / Q1 / Q.1 / Question 1:      start a question (1a) / 1. (a) start a sub-part)
 *   (a) / a) / [a] / a.                  options, one per line or several on one line
 *   [2] / (2 marks) / 2M / CO1 L2 05      marks at the end of the question or its last option
 *   ____ / ......                         a blank, which makes a fill-in question
 *   Ans: (c) / Answer: Queue              the answer to the question just above
 *   Answer key: 1-B, 2-C                  answers listed after the questions
 * Anything else continues the current question or option. Header lines are skipped.
 */

export const MAX_OPTIONS = 8;
export const BLANK = '_____';
const MAX_TEXT = 2000;

const NOISE = [
  /^usn\b/i,
  /^(time|duration)\s*[:-]/i,
  /^(time\s*:.*)?max(imum)?\.?\s*marks?\b/i,
  /^note\s*[:-]/i,
  /^(instructions?|answer\s+(all|any)|attempt\s+(all|any))\b/i,
  /^(part|section|unit|module)\s*[-:]?\s*([a-e]|[ivx]+|\d{1,2})\s*$/i,
  /^page\s*\d+(\s*of\s*\d+)?$/i,
  /^-?\s*\d{1,3}\s*-?$/, // bare page number
  /^[-_=*~.·•\s]{3,}$/, // rules and dot leaders
];

const QUESTION_START = [
  /^Q(?:uestion)?\s*[.-]?\s*(\d{1,3})(?![\d.]\d)\s*[.):-]?\s*/i,
  /^(\d{1,3})\s*[.)](?!\d)\s*/,
];
const SUB_PART = /^[([]?([a-h])\s*[)\].]\s+/i;
const NUMBER_WITH_SUB = /^(\d{1,3})\s*([a-h])\s*[).]\s+/i;
const DOT_OPTION = /^([a-h])\.\s+/i;
const ANSWER_LINE = /^(?:ans(?:wer)?|correct\s+answer|key)\s*[:.=-]\s*(.+)$/i;
const ANSWER_KEY_HEADING = /^(answer\s*key|answers|key)\s*[:-]?\s*/i;
const ANSWER_PAIR = /(\d{1,3})\s*[-.:)=]\s*[([]?([a-h])[)\]]?(?![a-z])/gi;
const TAG = /\s+(?:CO|BL|BT|PO|L)\s*-?\d{1,2}$/i;
const BLANK_RUN = /_{2,}|\.{4,}|…(\s*…)+|…{2,}/g;
const HAS_BLANK = /_{2,}|\.{4,}|…(\s*…)+|…{2,}/;
const BLANK_ONLY = /^(_{2,}|\.{4,}|…+)$/;

const letterIndex = (l) => l.toLowerCase().charCodeAt(0) - 97;

/**
 * Rebuilds reading-order lines from pdf.js text items: rows by baseline, top to bottom, then left
 * to right. pdf.js emits spaces as their own items and splits words at ligatures ("fi" + "rst"),
 * so items are joined directly and a space is added only where there is a visible gap.
 */
export function linesFromPdfItems(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str) continue;
    const [, , , , x, y] = item.transform;
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, (item.height || r.height) / 2));
    if (!row) rows.push((row = { y, height: item.height || 10, parts: [] }));
    row.parts.push({ x, end: x + (item.width || 0), str: item.str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      let line = '';
      let prevEnd = null;
      for (const p of row.parts.sort((a, b) => a.x - b.x)) {
        const gap = prevEnd === null ? 0 : p.x - prevEnd;
        if (line && gap > row.height * 0.2 && !/\s$/.test(line) && !/^\s/.test(p.str)) line += ' ';
        line += p.str;
        prevEnd = p.end;
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}

/** Undo the usual OCR and PDF-extraction artefacts on one line. */
export function normaliseLine(line) {
  return line
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .trim()
    .replace(/^[|¦]+\s*/, '')
    .replace(/\s*[|¦]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markers like "(a) " inside a line, keeping only an a, b, c… run that starts at `from`. */
function markerRun(str, from) {
  const re = /(^|\s)[([]?([a-h])[)\]]\s+/gi;
  const run = [];
  let m;
  while ((m = re.exec(str))) {
    if (letterIndex(m[2]) !== from + run.length) continue;
    run.push({ at: m.index + m[1].length, end: re.lastIndex });
  }
  return run;
}

function splitAt(str, run) {
  return {
    before: str.slice(0, run[0]?.at ?? str.length).trim(),
    parts: run.map((r, i) => str.slice(r.end, run[i + 1]?.at ?? str.length).trim()),
  };
}

/**
 * Removes a marks annotation (and course-outcome / level tags) from the end of a line.
 * Returns `{ text, marks }` where `marks` is a number or null.
 */
export function takeMarks(str) {
  let text = str.trim();
  let marks = null;
  for (let guard = 0; guard < 6; guard++) {
    const before = text;
    if (TAG.test(text)) text = text.replace(TAG, '').trim();
    if (marks === null) {
      const m =
        text.match(/(?:^|\s)\[\s*(\d{1,2}(?:\.\d)?)\s*(?:m|marks?)?\s*\]$/i) ||
        text.match(/(?:^|\s)\(\s*(\d{1,2}(?:\.\d)?)\s*(?:m|marks?)?\s*\)$/i) ||
        text.match(/(?:^|\s)(\d{1,2}(?:\.\d)?)\s*(?:m|marks?)\.?$/i) ||
        text.match(/(?<=\s(?:CO|BL|BT|PO|L)\s*-?\d{1,2})\s+(\d{1,2}(?:\.\d)?)$/i);
      if (m) {
        marks = Number(m[1]);
        text = text.slice(0, m.index).trim();
      }
    }
    if (text === before) break;
  }
  // A bare number left after tags were removed ("... 05 CO2 L3").
  if (marks === null && text !== str.trim()) {
    const m = text.match(/\s(\d{1,2})$/);
    if (m) {
      marks = Number(m[1]);
      text = text.slice(0, m.index).trim();
    }
  }
  return { text, marks: marks > 0 ? marks : null };
}

function newQuestion(number, sub, text) {
  return {
    number: sub ? `${number}${sub}` : number,
    base: number,
    sub: sub ? letterIndex(sub) : null,
    lines: [text],
    options: [],
    answer: null,
  };
}

function pushOptions(q, parts) {
  for (const part of parts) q.options.push([part]);
}

/** Attach a loose line to the current question: inline options, a new option or a continuation. */
function addLine(q, line) {
  const run = markerRun(line, q.options.length);
  if (run.length && run[0].at === 0) return pushOptions(q, splitAt(line, run).parts);
  const dot = line.match(DOT_OPTION);
  if (dot && letterIndex(dot[1]) === q.options.length && q.options.length)
    return q.options.push([line.slice(dot[0].length)]);
  if (dot && letterIndex(dot[1]) === 0 && !q.options.length)
    return q.options.push([line.slice(dot[0].length)]);
  if (q.options.length) q.options.at(-1).push(line);
  else q.lines.push(line);
}

/** One question becomes one draft, or several when its "options" are really marked sub-parts. */
function finish(q) {
  const warnings = [];
  let text = q.lines.filter(Boolean).join(' ');
  // Options written on the question line itself: "Which is FIFO? (a) Stack (b) Queue".
  if (!q.options.length) {
    const run = markerRun(text, 0);
    if (run.length >= 2 && run[0].at > 0) {
      const { before, parts } = splitAt(text, run);
      text = before;
      pushOptions(q, parts);
    }
  }
  let options = q.options.map((o) => o.join(' ').trim()).filter(Boolean);
  // "(a) Define X [5]  (b) Explain Y [5]" are sub-questions, not choices.
  if (options.filter((o) => takeMarks(o).marks !== null).length >= 2)
    return options.flatMap((o, i) =>
      finish({ ...newQuestion(q.base, String.fromCharCode(97 + i), o), sub: i }),
    );

  let { text: stem, marks } = takeMarks(text);
  if (options.length) {
    const last = takeMarks(options.at(-1));
    if (last.marks !== null) {
      options[options.length - 1] = last.text;
      if (marks === null) marks = last.marks;
    }
  }
  if (options.length === 1) {
    stem = `${stem} ${options[0]}`;
    options = [];
  }
  if (options.length > MAX_OPTIONS) {
    warnings.push(`Only the first ${MAX_OPTIONS} options were kept`);
    options = options.slice(0, MAX_OPTIONS);
  }
  if (marks !== null) {
    const rounded = Math.round(marks * 2) / 2;
    if (rounded > 10) warnings.push(`The paper gives ${marks} marks; the bank allows at most 10`);
    marks = Math.min(10, Math.max(0.5, rounded));
  }

  const hasBlank = HAS_BLANK.test(stem);
  stem = stem.replace(BLANK_RUN, BLANK);
  if (stem.length > MAX_TEXT) {
    warnings.push('Question text was shortened to 2000 characters');
    stem = stem.slice(0, MAX_TEXT);
  }

  const draft = {
    number: String(q.number),
    text: stem,
    marks,
    warnings,
    type: 'fill_blank',
    options: [],
    correctIndex: -1,
    answer: '',
  };
  if (options.length >= 2) {
    draft.type = 'single';
    draft.options = options.map((o) => o.slice(0, 500));
  } else if (!hasBlank) {
    warnings.push(
      'No options or blank found. This may be a long-answer question: add an accepted answer or remove it.',
    );
  }
  if (q.answer) applyAnswer(draft, q.answer);
  return [draft];
}

function applyAnswer(draft, raw) {
  const value = raw.trim();
  if (draft.type === 'single') {
    const letter = value.match(/^[([]?([a-h])(?:[)\].]|\s|$)/i);
    if (letter && letterIndex(letter[1]) < draft.options.length) draft.correctIndex = letterIndex(letter[1]);
    else {
      const byText = draft.options.findIndex((o) => o.toLowerCase() === value.toLowerCase());
      if (byText >= 0) draft.correctIndex = byText;
    }
  } else draft.answer = value.slice(0, 200);
}

/**
 * @param {string} text the whole paper; pages joined with newlines
 * @returns {{ drafts: Array<{ number: string, type: 'single'|'fill_blank', text: string, options: string[], correctIndex: number, answer: string, marks: number|null, warnings: string[] }>, skipped: string[] }}
 */
export function parseQuestionPaper(text) {
  const questions = [];
  const skipped = [];
  const keyed = [];
  let current = null;
  let inAnswerKey = false;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = normaliseLine(raw);
    if (!line) continue;

    const heading = line.match(ANSWER_KEY_HEADING);
    if (
      heading &&
      (inAnswerKey || /\d\s*[-.:)=]\s*[([]?[a-h]\b/i.test(line) || line.length === heading[0].length)
    ) {
      inAnswerKey = true;
      current = null;
    }
    if (inAnswerKey) {
      for (const m of line.matchAll(ANSWER_PAIR)) keyed.push({ number: m[1], letter: m[2] });
      continue;
    }

    const answer = line.match(ANSWER_LINE);
    if (answer && current) {
      current.answer = answer[1];
      continue;
    }

    const withSub = line.match(NUMBER_WITH_SUB);
    if (withSub) {
      current = newQuestion(withSub[1], withSub[2].toLowerCase(), line.slice(withSub[0].length));
      questions.push(current);
      continue;
    }
    const start = QUESTION_START.map((re) => line.match(re)).find(Boolean);
    if (start) {
      let rest = line.slice(start[0].length);
      const sub = rest.match(SUB_PART);
      if (sub) rest = rest.slice(sub[0].length);
      current = newQuestion(start[1], sub?.[1].toLowerCase(), rest);
      questions.push(current);
      continue;
    }
    // The next sub-part of a numbered question: "1. (a) Define…" followed by "(b) Explain…".
    const sub = line.match(SUB_PART);
    if (
      sub &&
      current?.sub !== null &&
      current?.sub !== undefined &&
      !current.options.length &&
      letterIndex(sub[1]) === current.sub + 1
    ) {
      current = newQuestion(current.base, sub[1].toLowerCase(), line.slice(sub[0].length));
      questions.push(current);
      continue;
    }

    // A blank that wrapped onto its own line belongs to the question above; elsewhere it is a rule.
    if (BLANK_ONLY.test(line.replace(/\s/g, ''))) {
      if (current && !current.options.length && markerRun(current.lines.join(' '), 0).length < 2)
        current.lines.push(line);
      else skipped.push(line);
      continue;
    }
    if (NOISE.some((re) => re.test(line))) {
      skipped.push(line);
      continue;
    }
    if (current) addLine(current, line);
    else skipped.push(line);
  }

  const drafts = questions.flatMap(finish).filter((d) => d.text.length >= 3 || d.options.length);
  for (const { number, letter } of keyed) {
    const draft = drafts.find((d) => d.number === number && d.correctIndex < 0 && !d.answer);
    if (draft) applyAnswer(draft, letter);
  }
  return { drafts, skipped };
}
