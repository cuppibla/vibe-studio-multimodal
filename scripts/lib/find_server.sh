#!/usr/bin/env bash
# Finding this checkout's learning center in the process table.
# Sourced by restart.sh, stop.sh and setup_codelab.sh. Expects PORT and a
# working directory of the repository root.
# ── finding this checkout's learning center ─────────────────────────────────
# No pid file. A recorded number is a hint that outlives the process it named:
# it survives a machine restart, pids are reused, and a wrapper that is killed
# outright leaves the real server running under a pid nobody wrote down. The
# process table is the only account of what is running now.
is_ancestor() {          # $1 is this shell or one of its parents
    local target="$1" p="$$"
    while [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null; do
        [ "$p" = "$target" ] && return 0
        p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d '[:space:]' || true)"
    done
    return 1
}

in_this_checkout() {     # $1 runs from this directory (Linux tells us; elsewhere assume yes)
    local pid="$1" cwd
    [ -r "/proc/$pid/cwd" ] || return 0
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [ -z "$cwd" ] && return 0
    [ "$cwd" = "$PWD" ]
}

is_our_server() {        # $1 is a live process that is this repo's learning center
    local pid="$1" cmd
    [ -n "$pid" ] || return 1
    case "$pid" in (*[!0-9]*) return 1 ;; esac
    [ "$pid" -gt 1 ] || return 1
    [ "$pid" = "$$" ] && return 1
    is_ancestor "$pid" && return 1
    cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    [ -n "$cmd" ] || return 1
    case "$cmd" in
        *uvicorn*server.main*|*scripts/start.sh*) ;;
        *) return 1 ;;
    esac
    in_this_checkout "$pid"
}

port_pids() {            # who is listening on a port; lsof is absent from some images
    # Every one of these exits non-zero when it finds nothing, which is the
    # ordinary case. Under `set -e` with pipefail an unguarded one ends the
    # calling script on the spot, with no output to say why.
    local out=""
    if command -v lsof >/dev/null 2>&1; then
        out="$(lsof -a -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)"
    fi
    if [ -z "$out" ] && command -v ss >/dev/null 2>&1; then
        out="$(ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
    fi
    if [ -z "$out" ] && command -v fuser >/dev/null 2>&1; then
        out="$(fuser -n tcp "$1" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true)"
    fi
    [ -n "$out" ] && printf '%s\n' "$out"
    return 0
}

lab_pids() {             # every live learning center of this checkout, port or not
    local candidates
    candidates="$( { port_pids "$PORT"
                     ps -eo pid=,command= 2>/dev/null \
                       | grep -E 'uvicorn +server\.main:app|scripts/start\.sh' \
                       | grep -v grep | awk '{print $1}' || true
                   } | sort -un || true)"
    local pid
    for pid in $candidates; do
        is_our_server "$pid" && echo "$pid"
    done
    return 0
}

stop_lab() {             # ask this checkout's server to stop, then insist
    local pid stopped=0 n=0
    for pid in $(lab_pids); do
        kill "$pid" 2>/dev/null || true
        printf '  · stopped %s (pid %s)\n' "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-52)" "$pid"
        stopped=1
    done
    [ "$stopped" = 0 ] && return 0
    # An open page holds an event stream, and uvicorn's graceful shutdown waits
    # for connections to close, so a TERM is a request rather than a promise.
    while [ -n "$(lab_pids)" ] && [ "$n" -lt 12 ]; do sleep 0.5; n=$((n + 1)); done
    for pid in $(lab_pids); do
        kill -9 "$pid" 2>/dev/null || true
        printf '  · it did not stop on its own; killed pid %s\n' "$pid"
    done
    return 0
}

wait_for_free_port() {   # nothing new can bind until the old server lets go
    local n=0
    while [ -n "$(port_pids "$1")" ] && [ "$n" -lt 24 ]; do sleep 0.5; n=$((n + 1)); done
    [ -z "$(port_pids "$1")" ]
}
