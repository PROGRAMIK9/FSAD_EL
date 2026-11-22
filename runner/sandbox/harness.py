"""
Runs inside a throwaway, network-less container as an unprivileged user.

stdin:  {"language", "source", "tests": [stdin, ...],
         "limits": {"cpuMs", "wallMs", "memoryMb", "outputKb"}}
stdout: {"compileOk", "compileOutput", "results": [{"status", "stdout", "stderr",
         "timeMs", "memoryKb", "exitCode"}]}

status: OK (exited 0) | RE | TLE | MLE | OLE (output limit)
"""
import json
import os
import resource
import signal
import subprocess
import sys
import time

BOX = "/box"
SHOW = 64 * 1024  # characters of output returned per stream
MB = 1024 * 1024

job = json.load(sys.stdin)
lang = job["language"]
limits = job.get("limits", {})
cpu_ms = int(limits.get("cpuMs", 2000))
wall_ms = int(limits.get("wallMs", 5000))
mem_mb = int(limits.get("memoryMb", 256))
out_kb = int(limits.get("outputKb", 1024))

FILES = {"c": "main.c", "cpp": "main.cpp", "java": "Main.java", "python": "main.py"}
COMPILE = {
    "c": ["gcc", "-O2", "-std=gnu17", "-pipe", "-o", "main", "main.c", "-lm"],
    "cpp": ["g++", "-O2", "-std=gnu++17", "-pipe", "-o", "main", "main.cpp"],
    "java": ["javac", "-J-Xmx512m", "-J-XX:+UseSerialGC", "-encoding", "UTF-8", "Main.java"],
    "python": ["python3", "-I", "-m", "py_compile", "main.py"],
}
RUN = {
    "c": ["./main"],
    "cpp": ["./main"],
    "java": ["java", f"-Xmx{mem_mb}m", "-Xss64m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1",
             "-Xshare:auto", "-cp", BOX, "Main"],
    "python": ["python3", "-I", "-B", "main.py"],
}


def clip(path):
    try:
        with open(path, "rb") as f:
            data = f.read(SHOW + 1)
    except OSError:
        return ""
    text = data[:SHOW].decode("utf-8", "replace")
    return text + "\n… (truncated)" if len(data) > SHOW else text


def emit(payload):
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()
    sys.exit(0)


with open(os.path.join(BOX, FILES[lang]), "w", encoding="utf-8") as f:
    f.write(job["source"])

# Compile once (generous limits: the compiler is trusted, the source is not).
try:
    c = subprocess.run(COMPILE[lang], cwd=BOX, stdin=subprocess.DEVNULL, capture_output=True,
                       timeout=30)
    compile_out = (c.stdout + c.stderr).decode("utf-8", "replace")[:SHOW]
    if c.returncode != 0:
        emit({"compileOk": False, "compileOutput": compile_out or "Compilation failed", "results": []})
except subprocess.TimeoutExpired:
    emit({"compileOk": False, "compileOutput": "Compilation took longer than 30 s", "results": []})


def limit_child():
    os.setsid()
    cpu = max(1, -(-cpu_ms // 1000))  # ceil to whole seconds; exact check uses rusage below
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
    resource.setrlimit(resource.RLIMIT_FSIZE, (out_kb * 1024, out_kb * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if lang != "java":  # the JVM reserves far more address space than it uses; -Xmx bounds it
        extra = 64 if lang == "python" else 16
        resource.setrlimit(resource.RLIMIT_AS, ((mem_mb + extra) * MB, (mem_mb + extra) * MB))
        resource.setrlimit(resource.RLIMIT_STACK, (min(mem_mb, 256) * MB, min(mem_mb, 256) * MB))


OOM_MARKERS = ("MemoryError", "std::bad_alloc", "OutOfMemoryError", "Cannot allocate memory")


def run_one(stdin_text):
    for name in ("in.txt", "out.txt", "err.txt"):
        try:
            os.remove(os.path.join(BOX, name))
        except OSError:
            pass
    with open(os.path.join(BOX, "in.txt"), "w", encoding="utf-8") as f:
        f.write(stdin_text or "")
    fin = open(os.path.join(BOX, "in.txt"), "rb")
    fout = open(os.path.join(BOX, "out.txt"), "wb")
    ferr = open(os.path.join(BOX, "err.txt"), "wb")
    start = time.monotonic()
    p = subprocess.Popen(RUN[lang], cwd=BOX, stdin=fin, stdout=fout, stderr=ferr,
                         preexec_fn=limit_child, close_fds=True)
    timed_out = False
    status_code, usage = 0, None
    while True:
        pid, status_code, usage = os.wait4(p.pid, os.WNOHANG)
        if pid:
            break
        if (time.monotonic() - start) * 1000 > wall_ms:
            timed_out = True
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except OSError:
                pass
            _, status_code, usage = os.wait4(p.pid, 0)
            break
        time.sleep(0.004)
    p.returncode = 0  # reaped by wait4 above
    for f in (fin, fout, ferr):
        f.close()
    # Kill anything the program left behind in its session.
    try:
        os.killpg(p.pid, signal.SIGKILL)
    except OSError:
        pass

    try:
        out_size = max(os.path.getsize(os.path.join(BOX, n)) for n in ("out.txt", "err.txt"))
    except OSError:
        out_size = 0
    cpu_used = int((usage.ru_utime + usage.ru_stime) * 1000)
    mem_kb = int(usage.ru_maxrss)
    stdout, stderr = clip(os.path.join(BOX, "out.txt")), clip(os.path.join(BOX, "err.txt"))
    sig = os.WTERMSIG(status_code) if os.WIFSIGNALED(status_code) else None
    code = os.WEXITSTATUS(status_code) if os.WIFEXITED(status_code) else None

    if timed_out or sig == signal.SIGXCPU or cpu_used > cpu_ms:
        status = "TLE"
    elif sig == signal.SIGXFSZ or out_size >= out_kb * 1024:  # Python ignores SIGXFSZ (EFBIG)
        status = "OLE"
    elif code == 0:
        status = "OK"
    elif any(m in stderr for m in OOM_MARKERS) or mem_kb >= mem_mb * 1024 * 0.95:
        status = "MLE"
    else:
        status = "RE"
        if not stderr:
            stderr = f"Killed by signal {signal.Signals(sig).name}" if sig else f"Exit code {code}"
    return {"status": status, "stdout": stdout, "stderr": stderr, "timeMs": cpu_used,
            "memoryKb": mem_kb, "exitCode": code}


emit({"compileOk": True, "compileOutput": compile_out,
      "results": [run_one(t) for t in job.get("tests", [])]})
