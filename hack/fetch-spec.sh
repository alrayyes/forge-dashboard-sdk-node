#!/usr/bin/env bash
# Pulls openapi/openapi.yaml from the exact forge-dashboard commit pinned
# in openapi/SPEC_COMMIT. Never hand-edit the spec copy itself -- bump the
# pin and re-run this instead (rules/sdk-generation.md's "one spec, many
# SDKs").
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
sha=$(cat openapi/SPEC_COMMIT)
curl -fsSL "https://raw.githubusercontent.com/alrayyes/forge-dashboard/${sha}/api/openapi.yaml" \
  -o openapi/openapi.yaml
