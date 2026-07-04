#!/usr/bin/env bash
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not found. Install it: brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks#installing" >&2
  exit 1
fi

gitleaks detect --source . --redact -v
