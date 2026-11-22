/**
 * Compiles and runs the generated LeetCode-style drivers (client/src/lib/function-drivers.js) for
 * every supported type in C, C++, Java and Python, with reference solutions. Needs the sandbox
 * image (skipped otherwise): docker build -t fsad-sandbox:latest runner/sandbox
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  MARKER,
  PARAM_TYPES,
  checkSignature,
  generateFunction,
} from '../../client/src/lib/function-drivers.js';

process.env.RUNNER_INSECURE = 'true';
process.env.RUNNER_CONCURRENCY = '6';
const { server } = await import('../server.js');

let haveImage = false;
try {
  execFileSync('docker', ['image', 'inspect', process.env.SANDBOX_IMAGE || 'fsad-sandbox:latest'], {
    stdio: 'ignore',
  });
  haveImage = true;
} catch {
  /* skipped below */
}

// Identity functions: return the argument unchanged, so the output is the canonical input.
const SAMPLES = {
  int: ['-42', '-42'],
  long: ['9000000000', '9000000000'],
  double: ['2.5', '2.50000'],
  bool: ['true', 'true'],
  string: ['"hi \\"there\\""', '"hi \\"there\\""'],
  'int[]': ['[1, -2, 3]', '[1,-2,3]'],
  'long[]': ['[]', '[]'],
  'double[]': ['[1.5,2]', '[1.50000,2.00000]'],
  'string[]': ['["a","b c"]', '["a","b c"]'],
  'int[][]': ['[[1,2],[],[3]]', '[[1,2],[],[3]]'],
};

const C_IDENTITY = {
  'int[]': 'int* echo(int* x, int xSize, int* returnSize) { *returnSize = xSize; return x; }',
  'long[]': 'long long* echo(long long* x, int xSize, int* returnSize) { *returnSize = xSize; return x; }',
  'double[]': 'double* echo(double* x, int xSize, int* returnSize) { *returnSize = xSize; return x; }',
  'string[]': 'char** echo(char** x, int xSize, int* returnSize) { *returnSize = xSize; return x; }',
  'int[][]':
    'int** echo(int** x, int xSize, int* xColSize, int* returnSize, int** returnColumnSizes) { *returnSize = xSize; *returnColumnSizes = xColSize; return x; }',
};
const C_SCALAR = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'char*' };
const CPP_T = {
  int: 'int',
  long: 'long long',
  double: 'double',
  bool: 'bool',
  string: 'string',
  'int[]': 'vector<int>',
  'long[]': 'vector<long long>',
  'double[]': 'vector<double>',
  'string[]': 'vector<string>',
  'int[][]': 'vector<vector<int>>',
};
const JAVA_T = {
  int: 'int',
  long: 'long',
  double: 'double',
  bool: 'boolean',
  string: 'String',
  'int[]': 'int[]',
  'long[]': 'long[]',
  'double[]': 'double[]',
  'string[]': 'String[]',
  'int[][]': 'int[][]',
};

const identity = (lang, t) =>
  ({
    c: C_IDENTITY[t] || `${C_SCALAR[t]} echo(${C_SCALAR[t]} x) { return x; }`,
    cpp: `class Solution { public: ${CPP_T[t]} echo(${CPP_T[t]}${t.endsWith('[]') || t === 'string' ? '&' : ''} x) { return x; } };`,
    java: `class Solution { public ${JAVA_T[t]} echo(${JAVA_T[t]} x) { return x; } }`,
    python: 'class Solution:\n    def echo(self, x):\n        return x\n',
  })[lang];

const TWO_SUM = {
  c: '#include <stdlib.h>\nint* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n  int* r = malloc(2 * sizeof(int)); *returnSize = 2;\n  for (int i = 0; i < numsSize; i++) for (int j = i + 1; j < numsSize; j++) if (nums[i] + nums[j] == target) { r[0] = i; r[1] = j; return r; }\n  *returnSize = 0; return r;\n}',
  cpp: 'class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { unordered_map<int,int> m; for (int i = 0; i < (int)nums.size(); i++) { if (m.count(target - nums[i])) return {m[target - nums[i]], i}; m[nums[i]] = i; } return {}; } };',
  java: 'import java.util.HashMap;\nclass Solution { public int[] twoSum(int[] nums, int target) { HashMap<Integer,Integer> m = new HashMap<>(); for (int i = 0; i < nums.length; i++) { Integer j = m.get(target - nums[i]); if (j != null) return new int[]{j, i}; m.put(nums[i], i); } return new int[0]; } }',
  python:
    'from typing import List\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n        return []\n',
};
const REVERSE = {
  c: 'void reverseString(char** s, int sSize) { for (int i = 0, j = sSize - 1; i < j; i++, j--) { char* t = s[i]; s[i] = s[j]; s[j] = t; } }',
  cpp: 'class Solution { public: void reverseString(vector<string>& s) { reverse(s.begin(), s.end()); } };',
  java: 'class Solution { public void reverseString(String[] s) { for (int i = 0, j = s.length - 1; i < j; i++, j--) { String t = s[i]; s[i] = s[j]; s[j] = t; } } }',
  python: 'class Solution:\n    def reverseString(self, s):\n        s.reverse()\n',
};

test('signatures are validated', () => {
  assert.deepEqual(
    checkSignature({ name: 'twoSum', params: [{ name: 'nums', type: 'int[]' }], returns: 'int[]' }),
    [],
  );
  assert.ok(checkSignature({ name: 'class', params: [], returns: 'int' }).length);
  assert.ok(
    checkSignature({
      name: 'f',
      params: [
        { name: 'a', type: 'int' },
        { name: 'a', type: 'int' },
      ],
      returns: 'int',
    }).length,
  );
  assert.ok(checkSignature({ name: 'f', params: [], returns: 'void' }).length);
});

test('every generated driver contains the marker', () => {
  for (const t of PARAM_TYPES) {
    const { drivers, starter } = generateFunction({
      name: 'echo',
      params: [{ name: 'x', type: t }],
      returns: t,
    });
    for (const lang of ['c', 'cpp', 'java', 'python']) {
      assert.ok(drivers[lang].includes(MARKER), `${lang} ${t}`);
      assert.ok(starter[lang].includes('echo'), `${lang} ${t}`);
    }
  }
});

test(
  'generated drivers compile and round-trip every type',
  { skip: !haveImage && 'sandbox image not built' },
  async (t) => {
    await new Promise((r) => server.listen(0, r));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${server.address().port}`;
    const run = async (language, driver, solution, tests) => {
      const res = await fetch(`${url}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          language,
          source: driver.replace(MARKER, solution),
          tests,
          limits: { cpuMs: 4000, wallMs: 10000 },
        }),
      });
      return res.json();
    };
    const jobs = [];
    for (const lang of ['c', 'cpp', 'java', 'python']) {
      for (const type of PARAM_TYPES) {
        jobs.push(
          t.test(`${lang} ${type}`, async () => {
            const { drivers } = generateFunction({
              name: 'echo',
              params: [{ name: 'x', type }],
              returns: type,
            });
            const [input, expected] = SAMPLES[type];
            const out = await run(lang, drivers[lang], identity(lang, type), [input]);
            assert.equal(out.compileOk, true, out.compileOutput);
            assert.equal(out.results[0].status, 'OK', out.results[0].stderr);
            assert.equal(out.results[0].stdout.trim(), expected);
          }),
        );
      }
      jobs.push(
        t.test(`${lang} two sum (two parameters)`, async () => {
          const { drivers } = generateFunction({
            name: 'twoSum',
            params: [
              { name: 'nums', type: 'int[]' },
              { name: 'target', type: 'int' },
            ],
            returns: 'int[]',
          });
          const out = await run(lang, drivers[lang], TWO_SUM[lang], ['[2,7,11,15]\n9', '[3,2,4]\n6\n']);
          assert.equal(out.compileOk, true, out.compileOutput);
          assert.deepEqual(
            out.results.map((r) => r.stdout.trim()),
            ['[0,1]', '[1,2]'],
          );
        }),
        t.test(`${lang} void prints the first argument`, async () => {
          const { drivers } = generateFunction({
            name: 'reverseString',
            params: [{ name: 's', type: 'string[]' }],
            returns: 'void',
          });
          const out = await run(lang, drivers[lang], REVERSE[lang], ['["h","e","y"]']);
          assert.equal(out.compileOk, true, out.compileOutput);
          assert.equal(out.results[0].stdout.trim(), '["y","e","h"]');
        }),
        t.test(`${lang} missing input lines is a runtime error`, async () => {
          const { drivers } = generateFunction({
            name: 'twoSum',
            params: [
              { name: 'nums', type: 'int[]' },
              { name: 'target', type: 'int' },
            ],
            returns: 'int[]',
          });
          const out = await run(lang, drivers[lang], TWO_SUM[lang], ['[1,2]']);
          assert.equal(out.results[0].status, 'RE');
        }),
      );
    }
    await Promise.all(jobs);
  },
);
