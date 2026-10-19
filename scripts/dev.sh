#!/usr/bin/env bash
# Development: the FastAPI server on :4600 (API, SSE, mounted ADK dev UI,
# media) with auto-reload, and the Vite dev server on :5173 with hot reload.
# Open http://localhost:5173.
#
# Ctrl+C stops both servers and everything they started (uvicorn's reload
# child, ADK's agent reload watcher, driver subprocesses). Stale instances on
# either port from an earlier session are stopped first.
set -euo pipefail
cd "$(dirname "$0")/.."
BACK_PORT=4600
FRONT_PORT=5173

stop_port() {
  # lsof ORs its selectors unless -a is given: without it, this would list
  # every listening socket on the machine, not just the one on our port.
  local pids ours=""
  pids=$(lsof -a -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)
  for pid in $pids; do
    if ps -o command= -p "$pid" | grep -q "vibe-studio-lab\|server.main\|adk web\|vite"; then
      echo "stopping stale process $pid on port $1"
      parent=$(ps -o ppid= -p "$pid" | tr -d ' ')
      if [ -n "$parent" ] && ps -o command= -p "$parent" | grep -q "scripts/\(start\|dev\)\.sh"; then
        kill "$parent" 2>/dev/null || true      # its exit trap only touches its own children
      fi
      kill "$pid" 2>/dev/null || true
      ours="$ours $pid"
    fi
  done
  sleep 0.5
  for pid in $ours; do kill -9 "$pid" 2>/dev/null || true; done
}

stop_tree() {
  local pid=$1
  [ -z "$pid" ] && return 0
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.5; done
  pkill -KILL -P "$pid" 2>/dev/null || true
  kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "stopping the dev servers and every process they started..."
  stop_tree "${BACK:-}"
  stop_tree "${FRONT:-}"
  echo "stopped."
}
trap cleanup EXIT INT TERM

[ -d .venv ] || uv sync
[ -d web/node_modules ] || (cd web && npm install)

stop_port "$BACK_PORT"
stop_port "$FRONT_PORT"
.venv/bin/uvicorn server.main:app --port "$BACK_PORT" --reload --reload-dir server --reload-dir agent &
BACK=$!
(cd web && npm run dev -- --port "$FRONT_PORT") &
FRONT=$!
echo "backend http://localhost:$BACK_PORT · frontend http://localhost:$FRONT_PORT  (Ctrl+C stops everything)"
wait
