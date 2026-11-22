import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { classify, importTestFiles, pairFiles, parseTestsJson } from '../lib/test-import.js';
import { MARKER, checkSignature, formatSignature, generateFunction } from '../lib/function-drivers.js';
import { fromQuestion, questionFormSchema, toQuestionPayload } from '../lib/schemas.js';
import { parseQuestionFile, QUESTION_FORMAT } from '../lib/question-io.js';

const file = (name, text) => ({ path: name, text });

describe('test case import', () => {
  it('recognises common naming schemes', () => {
    expect(classify('input/input00.txt')).toEqual({ side: 'in', key: '00' });
    expect(classify('output/output00.txt')).toEqual({ side: 'out', key: '00' });
    expect(classify('tests/1.in')).toEqual({ side: 'in', key: '1' });
    expect(classify('1.ans')).toEqual({ side: 'out', key: '1' });
    expect(classify('input/7.txt')).toEqual({ side: 'in', key: '7' });
    expect(classify('README.md')).toBeNull();
    expect(classify('__MACOSX/._1.in')).toBeNull();
  });

  it('pairs inputs with outputs in natural order and reports leftovers', () => {
    const { tests, unpaired, ignored } = pairFiles([file('10.in', 'j'), file('2.in', 'b'), file('2.out', 'B'), file('10.out', 'J'), file('3.in', 'c'), file('notes.md', '')]);
    expect(tests.map((t) => t.name)).toEqual(['2', '10']);
    expect(tests[0]).toMatchObject({ input: 'b', expectedOutput: 'B' });
    expect(unpaired).toEqual(['3.in']);
    expect(ignored).toEqual(['notes.md']);
  });

  it('reads JSON lists', () => {
    const t = parseTestsJson('[{"input":"1 2","output":"3"},{"input":"5","expectedOutput":"5","hidden":true,"weight":2}]');
    expect(t[1]).toMatchObject({ expectedOutput: '5', hidden: true, weight: 2 });
    expect(() => parseTestsJson('{"x":1}')).toThrow(/list of tests/);
    expect(() => parseTestsJson('[{"input":"1"}]')).toThrow(/output/);
  });

  it('unzips HackerRank test packs', async () => {
    const zip = zipSync({
      'input/input00.txt': strToU8('1 2\n'),
      'input/input01.txt': strToU8('5 5\n'),
      'output/output00.txt': strToU8('3\n'),
      'output/output01.txt': strToU8('10\n'),
    });
    // jsdom's Blob mangles binary data, so hand over a minimal File-like object.
    const zipFile = { name: 'tests.zip', arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) };
    const { tests, unpaired } = await importTestFiles([zipFile]);
    expect(unpaired).toEqual([]);
    expect(tests.map((t) => [t.input, t.expectedOutput])).toEqual([
      ['1 2\n', '3\n'],
      ['5 5\n', '10\n'],
    ]);
  });
});

describe('function questions', () => {
  const sig = { name: 'twoSum', params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }], returns: 'int[]' };

  it('validates and formats signatures', () => {
    expect(checkSignature(sig)).toEqual([]);
    expect(formatSignature(sig)).toBe('twoSum(nums: int[], target: int) → int[]');
    expect(checkSignature({ ...sig, name: '2sum' })[0]).toMatch(/identifier/);
  });

  it('generates starters and drivers that the form accepts', () => {
    const { starter, drivers } = generateFunction(sig);
    expect(starter.cpp).toContain('vector<int> twoSum(vector<int>& nums, int target)');
    expect(starter.c).toContain('int* twoSum(int* nums, int numsSize, int target, int* returnSize)');
    expect(starter.java).toContain('public int[] twoSum(int[] nums, int target)');
    expect(starter.python).toContain('def twoSum(self, nums: List[int], target: int) -> List[int]:');
    const values = {
      ...fromQuestion(null, 'subj'),
      type: 'code',
      text: 'Two sum',
      marks: 5,
    };
    values.code = { ...values.code, mode: 'function', signature: sig, starter, drivers, languages: ['cpp', 'python'], testCases: [{ input: '[2,7,11,15]\n9', expectedOutput: '[0,1]', weight: 1, hidden: false }] };
    expect(questionFormSchema.safeParse(values).success).toBe(true);
    const payload = toQuestionPayload(values);
    expect(Object.keys(payload.code.drivers)).toEqual(['cpp', 'python']);
    expect(payload.code.drivers.cpp).toContain(MARKER);
    expect(fromQuestion({ ...payload, subject: 'subj' }).code.signature).toEqual(sig);
    // Without drivers the form refuses.
    values.code.drivers = {};
    const r = questionFormSchema.safeParse(values);
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => /Generate the drivers/.test(i.message))).toBe(true);
  });
});

describe('question files', () => {
  it('reads export files and bare lists', () => {
    expect(parseQuestionFile(JSON.stringify({ format: QUESTION_FORMAT, questions: [{ type: 'single' }] }))).toHaveLength(1);
    expect(parseQuestionFile('[{"type":"code"}]')).toHaveLength(1);
    expect(() => parseQuestionFile('{"format":"other/x@1","questions":[]}')).toThrow(/Unknown format/);
    expect(() => parseQuestionFile('nope')).toThrow(/JSON/);
  });
});
