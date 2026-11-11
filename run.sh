#!/usr/bin/env bash
# RVCE Academic Hub: one-command local runner.
#
#   ./run.sh            set up (first run), start MongoDB, seed if empty, run API + client
#   ./run.sh setup      create .env and install dependencies only
#   ./run.sh seed       (re)load the sample accounts, subjects and quizzes
#   ./run.sh test       run the server test suite
#   ./run.sh build      production build of the client (client/dist)
#   ./run.sh stop       stop the MongoDB started by this script
#   ./run.sh help       show this help
#
# Local development only: the generated .env enables the sign-in picker
# (DEV_LOGIN=true), which is ignored when NODE_ENV=production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
DATA_DIR="$ROOT/.data"
MONGO_PID_FILE="$DATA_DIR/mongod.pid"
STARTED_MONGO=0

if [[ -t 1 ]]; then B=$'\e[1m' BLUE=$'\e[38;5;33m' YEL=$'\e[33m' RED=$'\e[31m' GRN=$'\e[32m' R=$'\e[0m'; else B='' BLUE='' YEL='' RED='' GRN='' R=''; fi
info() { printf '%s▸%s %s\n' "$BLUE$B" "$R" "$*"; }
ok() { printf '%s✓%s %s\n' "$GRN$B" "$R" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL$B" "$R" "$*" >&2; }
die() { printf '%s✗ %s%s\n' "$RED$B" "$*" "$R" >&2; exit 1; }

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

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
    -e "s|^DEV_LOGIN=.*|DEV_LOGIN=true|" \
    -e "s|^SEED_ACTIVATE=.*|SEED_ACTIVATE=true|" \
    .env.example >.env
  ok ".env created with a random JWT secret, local MongoDB and the dev sign-in picker"
  warn "DEV_LOGIN=true lets anyone on this machine sign in as a sample user. Keep it local."
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

ensure_mongo() {
  [[ "$MONGODB_URI" == mongodb+srv://* ]] && { ok "Using hosted MongoDB from MONGODB_URI"; return; }
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
    import mongoose from 'mongoose';
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log(await mongoose.connection.db.collection('users').countDocuments());
    await mongoose.disconnect();
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
    ok "Sample accounts created. Pick one on the sign-in page."
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

cleanup() {
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
    ensure_mongo
    seed_if_empty
    trap cleanup EXIT INT TERM
    printf '\n%sRVCE Academic Hub%s\n' "$B" "$R"
    printf '  App  %shttp://localhost:5173%s\n' "$BLUE" "$R"
    printf '  API  %shttp://localhost:%s/api%s\n\n' "$BLUE" "${PORT:-4000}" "$R"
    npm run dev
    ;;
  setup) setup ;;
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
    ;;
  build)
    check_tools
    ensure_deps
    npm run build
    ok "Client build written to client/dist"
    ;;
  stop) stop_mongo ;;
  help | -h | --help) usage ;;
  *)
    usage
    die "Unknown command: $cmd"
    ;;
esac
