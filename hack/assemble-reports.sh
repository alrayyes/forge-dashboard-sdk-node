#!/usr/bin/env bash
# Assembles the test and coverage reports into <out>/ (default site/reports)
# from the files `bun run test:ci` leaves behind (junit.xml and
# coverage/lcov.info). Needs `lcov_cobertura` (pip) and `genhtml` (apt: lcov).
# Fails if anything it promises is missing, so the docs workflow never
# publishes a half-built reports tree.
set -euo pipefail

out="${1:-site/reports}"
lcov="coverage/lcov.info"
junit="junit.xml"

for f in "$lcov" "$junit"; do
  [ -s "$f" ] || { echo "missing or empty: $f" >&2; exit 1; }
done

rm -rf "$out"
mkdir -p "$out/tests" "$out/coverage"

cp "$junit" "$out/tests/junit.xml"
cp "$lcov" "$out/coverage/lcov.info"
lcov_cobertura "$lcov" --output "$out/coverage/coverage.xml"
genhtml "$lcov" --output-directory "$out/coverage" --quiet
cp hack/reports-index.html "$out/index.html"

for f in index.html tests/junit.xml coverage/index.html coverage/lcov.info; do
  [ -s "$out/$f" ] || { echo "not produced: $out/$f" >&2; exit 1; }
done
grep -q '<coverage ' "$out/coverage/coverage.xml" || {
  echo "coverage.xml is not Cobertura XML" >&2
  exit 1
}
