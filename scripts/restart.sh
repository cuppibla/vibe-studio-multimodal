#!/usr/bin/env bash
# Restart the learning center in the background. Use this after a git pull or
# after editing the lab's own code; the step exercises need nothing of the kind.
#
#   scripts/restart.sh          stop it, rebuild the page if its sources changed, start it
#   scripts/restart.sh --pull   git pull first
#
# The built page is not in git, so a pull brings new sources and leaves the old
# build in place. scripts/start.sh compares the two and rebuilds when needed,
# which is why a restart is all this has to do.
#
# The server is found in the process table, never in a pid file: a recorded
# number outlives the process it named, and a wrapper killed outright leaves the
# real server running under a pid nobody wrote down. Nothing is killed that does
# not look like this repo's server and run from this directory, and never this
# shell or one of its ancestors.
# `sh scripts/restart.sh` runs a bash script under another shell. Re-enter under
# bash rather than fail somewhere later on a construct sh does not have.
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4600}"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
tick() { printf '  ✓ %s\n' "$1"; }
info() { printf '  · %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1" >&2; }

. "$(dirname "$0")/lib/find_server.sh"

say "Restarting the learning center"

if [ "${1:-}" = "--pull" ]; then
    info "git pull"
    git pull --ff-only || { printf '\n  git pull failed; nothing was restarted.\n\n' >&2; exit 1; }
fi

stop_lab

# Whatever still holds the port is not ours, or has not let go yet.
if ! wait_for_free_port "$PORT"; then
    printf '\n\033[1m✗ Port %s is still held; nothing was restarted.\033[0m\n\n' "$PORT" >&2
    for pid in $(port_pids "$PORT"); do
        warn "pid $pid  $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-70)"
    done
    warn "stop it yourself, then run this again"
    exit 1
fi

mkdir -p runs
PORT="$PORT" nohup scripts/start.sh > runs/lab.log 2>&1 &

for _ in $(seq 1 90); do
    if curl -s -o /dev/null "http://localhost:$PORT/api/lab/inspector"; then break; fi
    sleep 1
done

if ! curl -s -o /dev/null "http://localhost:$PORT/api/lab/inspector"; then
    printf '\n\033[1m✗ It did not answer on port %s.\033[0m\n\n' "$PORT" >&2
    warn "the last lines of runs/lab.log:"
    tail -6 runs/lab.log 2>/dev/null | sed 's/^/      /' >&2
    exit 1
fi

# Something answers. Whether it is the code in this directory is another
# question: if the old server kept the port, the new one exited on bind and the
# answer above came from the process this restart meant to replace.
HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
SERVING="$(curl -s "http://localhost:$PORT/api/lab/version" 2>/dev/null | sed -n 's/.*"running":"\([^"]*\)".*/\1/p')"
if [ -n "$HEAD_SHA" ] && [ -n "$SERVING" ] && [ "$HEAD_SHA" != "$SERVING" ]; then
    printf '\n\033[1m✗ Port %s is still served by the old code (%s), not this checkout (%s).\033[0m\n\n' "$PORT" "$SERVING" "$HEAD_SHA" >&2
    warn "the process holding the port was not stopped; these are the candidates:"
    for pid in $(port_pids "$PORT"); do
        warn "  pid $pid  $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-70)"
    done
    warn "stop it yourself, then run this again"
    exit 1
fi

if [ -n "${WEB_HOST:-}" ]; then
    LAB_URL="https://$PORT-$WEB_HOST"
else
    LAB_URL="http://localhost:$PORT"
fi

SRV="$(port_pids "$PORT" | head -1)"
tick "running in the background on port $PORT"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
[ -n "$COMMIT" ] && info "code     $COMMIT $(git log -1 --format=%s 2>/dev/null | cut -c1-58)"
printf '\n  %s\n\n' "$LAB_URL"
info "reload the browser tab to pick up the new page"
info "log      runs/lab.log"
info "stop     scripts/stop.sh${SRV:+   (it is pid $SRV)}"
printf '\n'
