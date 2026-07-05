#!/usr/bin/env bash
# Fails if the shared store modules copied into both skill bundles have diverged.
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
for f in models-states react-bindings mutations-writes lens-atoms ssr common-mistakes; do
  a=".agents/skills/rxfy/references/$f.md"
  b=".agents/skills/rxfy-framework/references/$f.md"
  if ! diff -q "$a" "$b" >/dev/null; then
    echo "DRIFT: $f.md differs between rxfy and rxfy-framework bundles" >&2
    status=1
  fi
done
exit $status
