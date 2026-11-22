#!/usr/bin/env bash
# RVCE Academic Hub: one-command local runner.
#
#   ./run.sh            set up (first run), start MongoDB and the code runner, seed if empty, run API + client
#   ./run.sh setup      create .env and install dependencies only
#   ./run.sh seed       load the MCA scheme: subjects, syllabus, questions, quiz drafts
#   ./run.sh runner     build the code sandbox image and run the code runner in the foreground
#   ./run.sh test       run the server, client and code runner tests
#   ./run.sh e2e        run the end-to-end browser tests on a throwaway database
#   ./run.sh build      production build of the client (client/dist)
#   ./run.sh stop       stop the MongoDB and code runner started by this script
#   ./run.sh help       show this help
#
# The generated .env is for local development; add your Google OAuth client ID
# to sign in. The sign-in picker (DEV_LOGIN=true) stays off unless you enable it.
#
# Options (environment variables):
#   LOCAL_DB=1          use a local MongoDB even if .env points at Atlas
#   DB_FALLBACK=0       fail instead of falling back to a local MongoDB when Atlas is unreachable
#   RUNNER=0            don't start the code runner (code runs on the fake judge)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
DATA_DIR="$ROOT/.data"
MONGO_PID_FILE="$DATA_DIR/mongod.pid"
STARTED_MONGO=0
STARTED_RUNNER=0
LOCAL_MONGO_URI="mongodb://127.0.0.1:27017/rvce_academic_hub"
RUNNER_PID_FILE="$DATA_DIR/runner.pid"
SANDBOX_IMAGE="${SANDBOX_IMAGE:-fsad-sandbox:latest}"

if [[ -t 1 ]]; then B=$'\e[1m' BLUE=$'\e[38;5;33m' YEL=$'\e[33m' RED=$'\e[31m' GRN=$'\e[32m' R=$'\e[0m'; else B='' BLUE='' YEL='' RED='' GRN='' R=''; fi
info() { printf '%s▸%s %s\n' "$BLUE$B" "$R" "$*"; }
ok() { printf '%s✓%s %s\n' "$GRN$B" "$R" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL$B" "$R" "$*" >&2; }
die() { printf '%s✗ %s%s\n' "$RED$B" "$*" "$R" >&2; exit 1; }

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; fi
}

check_tools() {
  command -v node >/dev/null 2>&1 || die "Node.js 20+ is required (https://nodejs.org)."
  command -v npm >/dev/null 2>&1 || die "npm is required."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  ((major >= 20)) || die "Node.js 20+ is required (found $(node -v))."
}

ensure_env() {
  if [[ -f .env ]]; then
    ok ".env found (left unchanged)"
    return
  fi
  [[ -f .env.example ]] || die ".env.example is missing."
  info "Creating .env for local development"
  sed \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(random_secret)|" \
    -e "s|^MONGODB_URI=.*|MONGODB_URI=mongodb://127.0.0.1:27017/rvce_academic_hub|" \
    .env.example >.env
  ok ".env created with a random JWT secret and a local MongoDB"
  warn "Set GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID in .env to enable Google sign-in."
}

load_env() {
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}

ensure_deps() {
  if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
    info "Installing dependencies (npm install)"
    npm install --no-audit --no-fund
  else
    ok "Dependencies are up to date"
  fi
}

# Host and port of MONGODB_URI, e.g. "127.0.0.1 27017".
mongo_target() {
  local rest="${MONGODB_URI#*://}"
  rest="${rest#*@}"
  rest="${rest%%/*}"
  rest="${rest%%,*}"
  local host="${rest%%:*}" port="27017"
  [[ "$rest" == *:* ]] && port="${rest##*:}"
  echo "$host $port"
}

port_open() { (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null; }

# True when one server of a mongodb+srv:// cluster accepts a TCP connection on its port.
# Many campus and office networks block outbound 27017, which makes Atlas unreachable.
atlas_reachable() {
  local host
  host="$(mongo_target | cut -d' ' -f1)"
  node -e "
    const dns = require('node:dns').promises, net = require('node:net');
    dns.resolveSrv('_mongodb._tcp.$host').then((srv) => new Promise((resolve, reject) => {
      const s = net.connect(srv[0].port, srv[0].name);
      s.setTimeout(5000, () => { s.destroy(); reject(new Error('timeout')); });
      s.on('connect', () => { s.end(); resolve(); });
      s.on('error', reject);
    })).then(() => process.exit(0), () => process.exit(1));
  " 2>/dev/null
}

ensure_mongo() {
  if [[ "${LOCAL_DB:-0}" == 1 && "$MONGODB_URI" != *127.0.0.1* && "$MONGODB_URI" != *localhost* ]]; then
    info "LOCAL_DB=1: using a local MongoDB instead of the one in .env"
    export MONGODB_URI="$LOCAL_MONGO_URI"
  fi
  if [[ "$MONGODB_URI" == mongodb+srv://* ]]; then
    info "Checking the hosted MongoDB (Atlas)"
    if atlas_reachable; then
      ok "Using hosted MongoDB from MONGODB_URI"
      return
    fi
    warn "Atlas is not reachable from this network (port 27017 blocked, or this IP is not on the Atlas allowlist)."
    [[ "${DB_FALLBACK:-1}" == 1 ]] || die "Atlas unreachable and DB_FALLBACK=0. Allow this IP in Atlas → Network Access, or use another network."
    warn "Using a LOCAL MongoDB for this run (.env is unchanged; Atlas data is not available here)."
    export MONGODB_URI="$LOCAL_MONGO_URI"
  fi
  read -r host port < <(mongo_target)
  if port_open "$host" "$port"; then
    ok "MongoDB is reachable at $host:$port"
    return
  fi
  [[ "$host" == "127.0.0.1" || "$host" == "localhost" ]] || die "MongoDB at $host:$port is not reachable. Check MONGODB_URI in .env."

  if command -v mongod >/dev/null 2>&1; then
    info "Starting MongoDB (data in .data/mongo)"
    mkdir -p "$DATA_DIR/mongo"
    mongod --dbpath "$DATA_DIR/mongo" --port "$port" --bind_ip 127.0.0.1 \
      --fork --logpath "$DATA_DIR/mongod.log" --pidfilepath "$MONGO_PID_FILE" >/dev/null
    STARTED_MONGO=1
  elif command -v docker >/dev/null 2>&1; then
    info "Starting MongoDB with Docker Compose"
    docker compose up -d mongo
  else
    die "MongoDB is not running and neither mongod nor docker is installed. Install MongoDB 7 or Docker."
  fi

  for _ in $(seq 1 30); do
    port_open "$host" "$port" && { ok "MongoDB is up on $host:$port"; return; }
    sleep 1
  done
  die "MongoDB did not start within 30 seconds (see .data/mongod.log)."
}

user_count() {
  node --input-type=module -e "
    import { connectDB } from './server/src/config/db.js';
    const db = await connectDB();
    console.log(await db.collection('users').countDocuments());
    await db.close();
  " 2>/dev/null || echo "unknown"
}

seed() {
  info "Loading sample data"
  npm run seed -w server --silent
}

seed_if_empty() {
  local n
  n="$(user_count)"
  if [[ "$n" == "0" ]]; then
    seed
    ok "Subjects, syllabus and quiz drafts loaded. Sign in with Google."
  elif [[ "$n" == "unknown" ]]; then
    warn "Could not count users; skipping automatic seeding (run ./run.sh seed if the app is empty)."
  else
    ok "Database already has $n users (not seeding)"
  fi
}

stop_mongo() {
  if [[ -f "$MONGO_PID_FILE" ]] && kill -0 "$(cat "$MONGO_PID_FILE")" 2>/dev/null; then
    info "Stopping MongoDB"
    mongod --dbpath "$DATA_DIR/mongo" --shutdown >/dev/null 2>&1 || kill "$(cat "$MONGO_PID_FILE")"
    rm -f "$MONGO_PID_FILE"
    ok "MongoDB stopped"
  else
    ok "No MongoDB started by run.sh is running"
  fi
}

# Refuses to start when the API or client port is taken, and says by what.
ensure_ports_free() {
  local busy=0 port pid state
  for port in "${PORT:-4000}" 5173; do
    port_open 127.0.0.1 "$port" || continue
    busy=1
    pid="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
    if [[ -n "$pid" ]]; then
      state="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d ' ')"
      if [[ "$state" == T* ]]; then
        warn "Port $port is held by a SUSPENDED process (PID $pid), probably an earlier ./run.sh stopped with Ctrl+Z."
      else
        warn "Port $port is already in use by PID $pid: $(ps -o args= -p "$pid" 2>/dev/null | cut -c1-80)"
      fi
    else
      warn "Port $port is already in use."
    fi
  done
  if ((busy)); then
    printf '\n  If it is an earlier run in this terminal: run %sjobs%s, then %skill -9 %%1%s (one per job),\n' "$B" "$R" "$B" "$R"
    printf '  or %sfg%s and press %sCtrl+C%s. Otherwise stop that process, then run ./run.sh again.\n' "$B" "$R" "$B" "$R"
    printf '  (Use Ctrl+C, not Ctrl+Z, to stop ./run.sh.)\n\n'
    die "Ports are busy; not starting a second copy."
  fi
}

# End-to-end tests: a temporary local MongoDB on port 27018 (never the database in .env).
run_e2e() {
  local port=27018 started=0 container=""
  if ! port_open 127.0.0.1 "$port"; then
    if command -v mongod >/dev/null 2>&1; then
      mkdir -p "$DATA_DIR/e2e-mongo"
      mongod --dbpath "$DATA_DIR/e2e-mongo" --port "$port" --bind_ip 127.0.0.1 --fork --logpath "$DATA_DIR/e2e-mongod.log" >/dev/null
      started=1
    elif command -v docker >/dev/null 2>&1; then
      container="$(docker run -d --rm -p "127.0.0.1:$port:27017" mongo:7)"
    else
      die "End-to-end tests need mongod or docker."
    fi
    for _ in $(seq 1 30); do port_open 127.0.0.1 "$port" && break; sleep 1; done
  fi
  ls "$HOME/.cache/ms-playwright" 2>/dev/null | grep -q '^chromium' || npx playwright install chromium
  info "Running end-to-end tests (database rvce_e2e on port $port)"
  local status=0
  MONGODB_URI="mongodb://127.0.0.1:$port/" MONGODB_DB=rvce_e2e npm run test:e2e || status=$?
  ((started)) && mongod --dbpath "$DATA_DIR/e2e-mongo" --shutdown >/dev/null 2>&1
  [[ -n "$container" ]] && docker stop "$container" >/dev/null
  return "$status"
}

# ---- code runner (runner/): compiles and runs student code in Docker sandboxes ----
RUNNER_PORT="${RUNNER_PORT:-2359}"

build_sandbox() {
  info "Building the code sandbox image $SANDBOX_IMAGE (gcc, g++, Java 17, Python 3; first time takes a few minutes)"
  # Host networking: Docker builds on hosts with a local DNS stub (e.g. systemd-resolved on Arch) cannot resolve otherwise.
  docker build --network host -t "$SANDBOX_IMAGE" runner/sandbox
}

runner_token() {
  mkdir -p "$DATA_DIR"
  [[ -s "$DATA_DIR/runner-token" ]] || random_secret >"$DATA_DIR/runner-token"
  cat "$DATA_DIR/runner-token"
}

# Starts the code runner in the background and points the API at it (unless .env already sets RUNNER_URL).
ensure_runner() {
  if [[ -n "${RUNNER_URL:-}" ]]; then
    ok "Code runner from .env: $RUNNER_URL"
    return
  fi
  if [[ "${RUNNER:-1}" == 0 ]]; then
    warn "RUNNER=0: code runs on the fake judge (no real compilation)."
    return
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    warn "Docker is not available: code runs on the fake judge. Install/start Docker for real C, C++, Java and Python."
    return
  fi
  docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1 || build_sandbox || {
    warn "Could not build the sandbox image: code runs on the fake judge."
    return
  }
  local token
  token="$(runner_token)"
  if port_open 127.0.0.1 "$RUNNER_PORT"; then
    warn "Port $RUNNER_PORT is in use; assuming a code runner started by an earlier ./run.sh is running."
  else
    info "Starting the code runner on port $RUNNER_PORT"
    RUNNER_AUTH_TOKEN="$token" PORT="$RUNNER_PORT" SANDBOX_IMAGE="$SANDBOX_IMAGE" \
      nohup node runner/server.js >"$DATA_DIR/runner.log" 2>&1 &
    echo $! >"$RUNNER_PID_FILE"
    STARTED_RUNNER=1
    for _ in $(seq 1 20); do port_open 127.0.0.1 "$RUNNER_PORT" && break; sleep 0.25; done
    port_open 127.0.0.1 "$RUNNER_PORT" || {
      warn "The code runner did not start (see .data/runner.log): code runs on the fake judge."
      return
    }
  fi
  export RUNNER_URL="http://127.0.0.1:$RUNNER_PORT" RUNNER_AUTH_TOKEN="$token"
  ok "Code runner ready: real C, C++, Java and Python"
}

stop_runner() {
  if [[ -f "$RUNNER_PID_FILE" ]] && kill -0 "$(cat "$RUNNER_PID_FILE")" 2>/dev/null; then
    info "Stopping the code runner"
    kill "$(cat "$RUNNER_PID_FILE")"
    rm -f "$RUNNER_PID_FILE"
    ok "Code runner stopped"
  fi
}

cleanup() {
  ((STARTED_RUNNER)) && stop_runner
  ((STARTED_MONGO)) && stop_mongo
  return 0
}

setup() {
  check_tools
  ensure_env
  load_env
  ensure_deps
}

cmd="${1:-dev}"
case "$cmd" in
  dev | start)
    setup
    ensure_ports_free
    trap cleanup EXIT INT TERM
    ensure_mongo
    seed_if_empty
    ensure_runner
    printf '\n%sRVCE Academic Hub%s\n' "$B" "$R"
    printf '  App   %shttp://localhost:5173%s\n' "$BLUE" "$R"
    printf '  API   %shttp://localhost:%s/api%s\n' "$BLUE" "${PORT:-4000}" "$R"
    printf '  DB    %s\n' "$([[ "$MONGODB_URI" == mongodb+srv://* ]] && echo 'MongoDB Atlas' || echo "local MongoDB ($(mongo_target | tr ' ' :))")"
    printf '  Code  %s\n' "${RUNNER_URL:+real compilers via the code runner ($RUNNER_URL)}${RUNNER_URL:-fake judge (no real compilation)}"
    printf '  Stop with Ctrl+C (Ctrl+Z only suspends it and keeps the ports busy)\n\n'
    npm run dev
    ;;
  setup) setup ;;
  runner)
    check_tools
    command -v docker >/dev/null 2>&1 || die "The code runner needs Docker."
    [[ "${REBUILD:-0}" == 1 ]] || ! docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1 && build_sandbox
    token="${RUNNER_AUTH_TOKEN:-$(runner_token)}"
    ok "Code runner on http://127.0.0.1:$RUNNER_PORT (token in .data/runner-token)"
    RUNNER_AUTH_TOKEN="$token" PORT="$RUNNER_PORT" SANDBOX_IMAGE="$SANDBOX_IMAGE" exec node runner/server.js
    ;;
  seed)
    setup
    ensure_mongo
    seed
    trap cleanup EXIT
    ;;
  test)
    check_tools
    ensure_deps
    npm test
    npm run test:client
    if command -v docker >/dev/null 2>&1 && docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1; then
      (cd runner && npm test --silent)
    else
      warn "Skipping code runner tests (build the sandbox with ./run.sh runner first)."
    fi
    ;;
  e2e)
    check_tools
    ensure_deps
    run_e2e
    ;;
  build)
    check_tools
    ensure_deps
    npm run build
    ok "Client build written to client/dist"
    ;;
  stop)
    stop_runner
    stop_mongo
    ;;
  help | -h | --help) usage ;;
  *)
    usage
    die "Unknown command: $cmd"
    ;;
esac
