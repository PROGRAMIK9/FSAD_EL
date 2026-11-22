# Code runner

The code runner compiles and runs student code (C, C++, Java, Python 3) for the coding environment. It works on **cgroup v2** hosts (Arch, Fedora, Ubuntu 22.04+, Debian 12, WSL2), because Docker enforces the limits itself; no kernel changes are needed.

```
app (queue in MongoDB) ──POST /execute──▶ runner :2359 ──docker run──▶ throwaway sandbox container
                                         (N at a time)                 compile once, run every test
```

Each submission gets a fresh container built from `sandbox/`, which contains gcc, g++, OpenJDK 17, Python 3 and `harness.py`. The container has:

| Limit | Setting |
|---|---|
| Network | none (`--network none`) |
| User | `nobody` (65534), all capabilities dropped, `no-new-privileges` |
| File system | read-only root; the only writable places are a 64 MB `/box` and a 16 MB `/tmp`, both tmpfs |
| CPU | 1 core per container; per-test CPU time (`RLIMIT_CPU`) and wall time |
| Memory | container limit = question limit + compiler headroom; per-test `RLIMIT_AS` (C, C++, Python) or `-Xmx` (Java) |
| Processes | 64 (`--pids-limit`), so fork bombs are contained |
| Output | 1 MB per test (`RLIMIT_FSIZE`); 64 KB is returned |

The container is removed after each submission. The harness reports `OK`, `RE`, `TLE`, `MLE` or `OLE` per test, or a compile error. The app compares the output with the expected output and scores the run.

For stronger isolation, install [gVisor](https://gvisor.dev) and set `RUNNER_DOCKER_RUNTIME=runsc`.

## Run it

On any host with Docker:

```sh
cd runner
export RUNNER_AUTH_TOKEN=$(openssl rand -hex 32)
docker compose up -d --build          # builds fsad-sandbox:latest and starts the runner
curl localhost:2359/health            # {"ok":true,...}
```

Without the container (local development), from the repository root:

```sh
docker build --network host -t fsad-sandbox:latest runner/sandbox
RUNNER_AUTH_TOKEN=dev node runner/server.js
```

Then point the app at the runner (in `.env`):

```
RUNNER_URL=http://localhost:2359
RUNNER_AUTH_TOKEN=<same token>
```

> **Arch / systemd-resolved:** if `docker build` cannot resolve `deb.debian.org`, build with `--network host`. The compose file already does this.

### Settings

| Variable | Default | |
|---|---|---|
| `RUNNER_AUTH_TOKEN` | required | Shared secret, sent by the app as `X-Auth-Token` |
| `RUNNER_CONCURRENCY` | number of CPUs | Containers running at once; the rest wait in order |
| `RUNNER_MAX_QUEUE` | 500 | Jobs waiting beyond this get a 503, which the app retries |
| `RUNNER_DOCKER_RUNTIME` | (runc) | e.g. `runsc` for gVisor |
| `SANDBOX_IMAGE` | `fsad-sandbox:latest` | |

## Production

- Run the runner on its **own VM**, not the app host. Whoever can reach the Docker socket controls the machine, and student code should never share a box with secrets. Render web services cannot run Docker, so the app stays on Render and the runner goes on a VM.
- Firewall port 2359 to the app's outbound IPs, or put the runner behind a TLS reverse proxy and use `https://` in `RUNNER_URL`.
- **Sizing for 250 students:** use an 8 vCPU / 16 GB VM with `RUNNER_CONCURRENCY=8`.
  - A submission takes about 0.6 s for C or C++ (container start plus compile plus tests), about 1.5–2 s for Java and about 0.5 s for Python.
  - The end-of-exam burst of 250 final submissions drains in well under two minutes.
  - On the app, set `JUDGE_MAX_INFLIGHT` to about 2 × the runner's concurrency.
- **Scaling:** run more runner VMs behind a load balancer under the same `RUNNER_URL`.

## Tests

```sh
cd runner && npm test
```

The tests check the following against the real image (they are skipped if the image is not built):

- All four languages, with several tests per submission.
- Compile errors and runtime errors.
- An infinite loop and `sleep` hitting the time limit.
- 1 GB allocations in C, Python and Java hitting the memory limit.
- A fork bomb.
- A network connection attempt.
- Endless output hitting the output limit.
- Writing outside `/box`.
