#!/usr/bin/env bash
# Run the app locally: build the page once, start the server on 4700.
set -euo pipefail
cd "$(dirname "$0")/.."
# The built page is not in git: rebuild when the sources are newer than the build.
needs_build=0
[ -f vibestudio/web/dist/index.html ] || needs_build=1
if [ "$needs_build" = 0 ] && [ -n "$(find vibestudio/web/src vibestudio/web/index.html vibestudio/web/package.json -newer vibestudio/web/dist/index.html -print -quit 2>/dev/null)" ]; then
  needs_build=1
  echo "the page sources changed since the last build; rebuilding"
fi
[ "${REBUILD:-0}" = "1" ] && needs_build=1
if [ "$needs_build" = 1 ]; then
  (cd vibestudio/web && ([ -d node_modules ] || npm install) && npm run build)
fi
exec .venv/bin/python -m vibestudio
