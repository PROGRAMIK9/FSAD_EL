/**
 * Turns test files into { input, expectedOutput } pairs for coding questions.
 *
 * Accepted:
 *  - HackerRank zips:      input/input00.txt + output/output00.txt
 *  - name pairs:           1.in / 1.out (or .ans, .a, .ok), sample.in / sample.out
 *                          input01.txt / output01.txt, in1.txt / out1.txt
 *  - JSON:                 [{ input, output | expectedOutput, hidden?, weight? }] or { testCases: [...] }
 */
import { unzipSync, strFromU8 } from 'fflate';

const IN_EXT = /\.(in|input)$/i;
const OUT_EXT = /\.(out|ans|a|ok|output|expected)$/i;

/** Key that an input file and its output file share, plus which side it is (or null). */
export function classify(path) {
  const name = path.split('/').pop();
  const dir = path.split('/').slice(-2, -1)[0]?.toLowerCase() || '';
  if (!name || name.startsWith('.') || /^__MACOSX/.test(path)) return null;
  const stem = name.replace(/\.[^.]+$/, '');
  if (IN_EXT.test(name)) return { side: 'in', key: name.replace(IN_EXT, '') };
  if (OUT_EXT.test(name)) return { side: 'out', key: name.replace(OUT_EXT, '') };
  // input00.txt / output00.txt, in1.txt / out1.txt, input/1.txt / output/1.txt
  let m = stem.match(/^(input|in)[-_]?(.*)$/i);
  if (m) return { side: 'in', key: m[2] || '0' };
  m = stem.match(/^(output|out|expected|answer|ans)[-_]?(.*)$/i);
  if (m) return { side: 'out', key: m[2] || '0' };
  if (/^(input|in)s?$/.test(dir)) return { side: 'in', key: stem };
  if (/^(output|out|expected|answers?)s?$/.test(dir)) return { side: 'out', key: stem };
  return null;
}

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Pairs `files` ([{ path, text }]). Returns `{ tests, unpaired, ignored }`; tests are sorted
 * naturally by key ("2" before "10").
 */
export function pairFiles(files) {
  const groups = new Map();
  const ignored = [];
  for (const f of files) {
    const c = classify(f.path);
    if (!c) {
      ignored.push(f.path);
      continue;
    }
    const key = c.key.toLowerCase();
    const g = groups.get(key) || { key: c.key };
    g[c.side] = f;
    groups.set(key, g);
  }
  const tests = [];
  const unpaired = [];
  for (const g of [...groups.values()].sort((a, b) => natural(a.key, b.key))) {
    if (g.in && g.out) tests.push({ name: g.key, input: g.in.text, expectedOutput: g.out.text });
    else unpaired.push((g.in || g.out).path);
  }
  return { tests, unpaired, ignored };
}

/** Parses a JSON list of tests. */
export function parseTestsJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.testCases) ? data.testCases : null;
  if (!list) throw new Error('Expected a list of tests, e.g. [{ "input": "1 2", "output": "3" }]');
  return list.map((t, i) => {
    const expected = t?.expectedOutput ?? t?.output ?? t?.expected;
    if (typeof expected !== 'string' && typeof expected !== 'number') throw new Error(`Test ${i + 1}: add "output"`);
    return {
      name: String(i + 1),
      input: String(t.input ?? ''),
      expectedOutput: String(expected),
      ...(typeof t.hidden === 'boolean' ? { hidden: t.hidden } : {}),
      ...(Number(t.weight) > 0 ? { weight: Number(t.weight) } : {}),
    };
  });
}

const readText = (file) => (file.text ? file.text() : new Response(file).text());
const readBytes = async (file) => new Uint8Array(file.arrayBuffer ? await file.arrayBuffer() : await new Response(file).arrayBuffer());

/** Reads browser File objects (zip, json or plain test files) into pairs. */
export async function importTestFiles(fileList) {
  const files = [];
  const jsonTests = [];
  for (const file of fileList) {
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(await readBytes(file));
      for (const [path, bytes] of Object.entries(entries)) if (!path.endsWith('/')) files.push({ path, text: strFromU8(bytes) });
    } else if (/\.json$/i.test(file.name)) {
      jsonTests.push(...parseTestsJson(await readText(file)));
    } else {
      files.push({ path: file.webkitRelativePath || file.name, text: await readText(file) });
    }
  }
  const paired = pairFiles(files);
  return { ...paired, tests: [...jsonTests, ...paired.tests] };
}
