#!/usr/bin/env bash
# Runs a publish command, treating "this version is already published" as
# success so a retry of the Release workflow can get past a publish that
# already happened and reach the steps after it. Any other failure still fails.
#
#   hack/publish-once.sh npm publish --provenance --access public
set -uo pipefail

output="$("$@" 2>&1)"
status=$?
printf '%s\n' "$output"
if [ "$status" -eq 0 ]; then
  exit 0
fi

# npmjs.org: "You cannot publish over the previously published versions".
# GitHub Packages: 409 "Cannot publish over existing version".
if printf '%s' "$output" | grep -Eiq 'previously published|over existing version|E409'; then
  echo "publish-once: this version is already published, continuing" >&2
  exit 0
fi

exit "$status"
