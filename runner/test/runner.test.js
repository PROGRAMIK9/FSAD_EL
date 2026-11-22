/**
 * Runs real programs in the sandbox image. Skipped when Docker or the image is missing:
 *   docker build -t fsad-sandbox:latest runner/sandbox && node --test runner/test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

process.env.RUNNER_INSECURE = 'true';
process.env.RUNNER_CONCURRENCY = '4';
const { server, normalizeJob, dockerArgs } = await import('../server.js');

let haveImage = false;
try {
  execFileSync('docker', ['image', 'inspect', process.env.SANDBOX_IMAGE || 'fsad-sandbox:latest'], {
    stdio: 'ignore',
  });
  haveImage = true;
} catch {
  /* skipped below */
}

test('jobs are validated and limits clamped', () => {
  assert.throws(() => normalizeJob({ language: 'ruby', source: 'x' }), /language/);
  assert.throws(() => normalizeJob({ language: 'c', source: '' }), /Source/);
  const job = normalizeJob({
    language: 'c',
    source: 'x',
    tests: [1, null],
    limits: { cpuMs: 1e9, memoryMb: 1 },
  });
  assert.deepEqual(job.tests, ['1', '']);
  assert.equal(job.limits.cpuMs, 15_000);
  assert.equal(job.limits.memoryMb, 32);
});

test('containers are locked down', () => {
  const args = dockerArgs(normalizeJob({ language: 'c', source: 'x' }), 'n').join(' ');
  for (const flag of [
    '--network none',
    '--read-only',
    '--cap-drop ALL',
    '--pids-limit 64',
    '--user 65534:65534',
    'no-new-privileges',
  ])
    assert.ok(args.includes(flag), flag);
});

const ADD = {
  c: '#include <stdio.h>\nint main(void){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}\n',
  cpp: '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}\n',
  java: 'import java.util.*;\npublic class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}\n',
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
};

test('sandbox', { skip: !haveImage && 'sandbox image not built' }, async (t) => {
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const exec = async (language, source, tests = [''], limits = {}) => {
    const res = await fetch(`${url}/execute`, {
      method: 'POST',
      body: JSON.stringify({ language, source, tests, limits }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
  };

  await t.test('health reports the image', async () => {
    const h = await (await fetch(`${url}/health`)).json();
    assert.equal(h.ok, true);
  });

  await Promise.all(
    Object.entries(ADD).map(([lang, src]) =>
      t.test(`${lang}: compiles once and runs every test`, async () => {
        const out = await exec(lang, src, ['1 2', '40 2', '-5 5']);
        assert.equal(out.compileOk, true, out.compileOutput);
        assert.deepEqual(
          out.results.map((r) => r.status),
          ['OK', 'OK', 'OK'],
        );
        assert.deepEqual(
          out.results.map((r) => r.stdout.trim()),
          ['3', '42', '0'],
        );
      }),
    ),
  );

  await t.test('compile errors are reported', async () => {
    const out = await exec('cpp', 'int main(){ return x; }');
    assert.equal(out.compileOk, false);
    assert.match(out.compileOutput, /not declared/);
    const py = await exec('python', 'def f(:\n');
    assert.equal(py.compileOk, false);
    const java = await exec('java', 'public class Main { void x( }');
    assert.equal(java.compileOk, false);
  });

  await t.test('runtime errors', async () => {
    const c = await exec('c', '#include <stdlib.h>\nint main(void){int *p=0; return *p;}');
    assert.equal(c.results[0].status, 'RE');
    const py = await exec('python', 'raise ValueError("boom")');
    assert.equal(py.results[0].status, 'RE');
    assert.match(py.results[0].stderr, /boom/);
  });

  await t.test('infinite loops hit the time limit', async () => {
    const out = await exec('cpp', 'int main(){ volatile long x=0; for(;;) x++; }', [''], {
      cpuMs: 1000,
      wallMs: 3000,
    });
    assert.equal(out.results[0].status, 'TLE');
    const sleepy = await exec('python', 'import time\ntime.sleep(10)', [''], { cpuMs: 1000, wallMs: 1500 });
    assert.equal(sleepy.results[0].status, 'TLE');
  });

  await t.test('memory limits', async () => {
    const c = await exec(
      'c',
      '#include <stdlib.h>\n#include <string.h>\nint main(void){char*p=malloc(1<<30); if(!p) return 3; memset(p,1,1<<30); return 0;}',
      [''],
      { memoryMb: 128 },
    );
    assert.ok(['MLE', 'RE'].includes(c.results[0].status), c.results[0].status);
    const py = await exec('python', 'x = bytearray(1 << 30)', [''], { memoryMb: 128 });
    assert.equal(py.results[0].status, 'MLE');
    const java = await exec(
      'java',
      'public class Main{public static void main(String[] a){long[][] x=new long[1000][];for(int i=0;i<1000;i++)x[i]=new long[1<<20];}}',
      [''],
      { memoryMb: 128, cpuMs: 4000 },
    );
    assert.equal(java.results[0].status, 'MLE');
  });

  await t.test('a fork bomb is contained', async () => {
    const out = await exec('c', '#include <unistd.h>\nint main(void){for(;;) fork();}', [''], {
      cpuMs: 1000,
      wallMs: 2000,
    });
    assert.ok(['TLE', 'RE'].includes(out.results[0].status));
    const ok = await exec('python', 'print(1)');
    assert.equal(ok.results[0].status, 'OK');
  });

  await t.test('no network', async () => {
    const out = await exec(
      'python',
      'import socket\nsocket.create_connection(("1.1.1.1", 80), timeout=2)\nprint("connected")',
    );
    assert.equal(out.results[0].status, 'RE');
    assert.doesNotMatch(out.results[0].stdout, /connected/);
  });

  await t.test('endless output hits the output limit', async () => {
    const out = await exec('python', 'while True: print("x" * 1000)', [''], { wallMs: 5000 });
    assert.equal(out.results[0].status, 'OLE');
    assert.ok(out.results[0].stdout.length <= 70 * 1024);
  });

  await t.test('the file system is read-only outside the box', async () => {
    const out = await exec('python', 'open("/etc/hacked", "w").write("x")');
    assert.equal(out.results[0].status, 'RE');
  });
});
