#!/usr/bin/env bash
# Stop this checkout's learning center.
#
# It is found in the process table, not in a file: a recorded pid outlives the
# process it named, and the number in it is worth nothing once the pid has been
# reused. Nothing outside this directory is touched, and neither is the shell
# you are typing in.
# `sh scripts/restart.sh` runs a bash script under another shell. Re-enter under
# bash rather than fail somewhere later on a construct sh does not have.
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4600}"
. "$(dirname "$0")/lib/find_server.sh"

info() { printf '  · %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1" >&2; }

printf '\n\033[1mStopping the learning center\033[0m\n'

stop_lab || true
if [ -z "$(port_pids "$PORT")" ]; then
    info "port $PORT is free"
fi

for pid in $(port_pids "$PORT"); do
    if ! is_our_server "$pid" && ! is_ancestor "$pid"; then
        warn "port $PORT is still held by pid $pid, which is not this repo's server"
        warn "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-90)"
    fi
done

rm -f runs/lab.pid          # nothing reads it any more; do not leave one behind
printf '\n'
