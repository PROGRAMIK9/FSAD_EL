# Judge0: the code sandbox

Student code (C, C++, Java, Python 3) is compiled and run by [Judge0 CE](https://github.com/judge0/judge0) 1.13.1. Judge0 runs each program inside the `isolate` sandbox with CPU, memory, process and file-size limits, and with no network.

Judge0 runs on its own VM. It never runs on the app host:

- Judge0 needs privileged Docker containers and cgroup v1. Render's web services and most PaaS hosts provide neither.
- If a sandbox escape ever happens, it lands on a box that holds no app secrets and no database.

```
students ──▶ app (Render) ──X-Auth-Token──▶ Judge0 VM :2358 (firewalled to the app)
```

## Sizing for 250 concurrent students

| | |
|---|---|
| VM | 8 vCPU, 16 GB RAM, 40 GB disk, Ubuntu 22.04 |
| Workers | `COUNT=8` (one per vCPU) |
| App cap | `JUDGE_MAX_INFLIGHT=40` executions handed to Judge0 at once; the rest wait in MongoDB |

Typical load, with numbers from the load test in `loadtest/`:

- **Run** checks only the sample tests (usually 1 to 3). Each student has at most one run in flight, and each session is limited to 30 runs per 5 minutes.
- **Submit code** checks every test. The final grading after an exam reuses the result of the last *Submit code* on identical code, so it often costs nothing.
- **End of exam burst:** 250 students × about 8 tests is about 2,000 executions at about 1 s each. On 8 workers that takes about 4 to 5 minutes. Grading is asynchronous: the monitor shows "Grading…" until each attempt is done.

To go faster, add vCPUs and raise `COUNT`, or run more worker VMs against the same Redis and Postgres. Raise `JUDGE_MAX_INFLIGHT` on the app to match (about 5 × the total worker count).

## Setup

1. **Use cgroup v1.** Judge0 1.13 requires it. On Ubuntu 22.04:
   ```sh
   sudo sed -i 's/^GRUB_CMDLINE_LINUX="\(.*\)"/GRUB_CMDLINE_LINUX="\1 systemd.unified_cgroup_hierarchy=0"/' /etc/default/grub
   sudo update-grub && sudo reboot
   ```
2. **Install Docker** (Engine and the Compose plugin).
3. **Configure:**
   ```sh
   cp judge0.conf.example judge0.conf
   # Set AUTHN_TOKEN, REDIS_PASSWORD and POSTGRES_PASSWORD to long random values:
   openssl rand -hex 32
   ```
4. **Start:**
   ```sh
   docker compose up -d
   curl -H "X-Auth-Token: $TOKEN" http://localhost:2358/languages | head
   ```
5. **Firewall:** allow port 2358 only from the app's outbound IPs. Render lists them under the service's *Connect → Outbound* tab. Alternatively, put Judge0 behind a reverse proxy with TLS and point `JUDGE0_URL` at `https://`.
6. **Point the app at it:**
   ```
   JUDGE0_URL=http://<vm-ip>:2358
   JUDGE0_AUTH_TOKEN=<AUTHN_TOKEN>
   JUDGE_MAX_INFLIGHT=40
   ```
   At startup the app logs the language ids it found (`[judge0] language ids …`).

## Checking the sandbox

Use the question bank's *Check a reference solution* box, or the playground, to try these. Each one must fail safely:

| Program | Expected |
|---|---|
| `while(1);` | Time limit exceeded |
| allocating 1 GB | Runtime error or memory limit |
| `fork()` in a loop | Runtime error; the VM stays healthy |
| opening a socket to the internet | Runtime error (no network) |
| writing a 100 MB file | Runtime error (file size limit) |

## Without Judge0

When `JUDGE0_URL` is not set outside production, the app uses `JUDGE_MODE=fake`. This deterministic stand-in never runs code: a program "prints" the expected output, unless its source contains `FAKE:WA`, `FAKE:CE`, `FAKE:TLE` or `FAKE:RE`. Tests, CI and local development use it. In production without `JUDGE0_URL`, code execution is off and Run/Submit return 503.
