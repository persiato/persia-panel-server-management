#!/usr/bin/env bash
# Single-command installer: runs install.sh (OS packages/services) and then
# deploy.sh (build + deploy the panel app) back to back, so a fresh server
# only needs one command instead of two:
#
#   sudo bash installer/quickstart.sh
#
# Equivalent to:
#   sudo bash installer/install.sh
#   sudo bash installer/deploy.sh
#
# Optional env vars (same as deploy.sh):
#   PANEL_HOST=panel.example.com sudo bash installer/quickstart.sh
#
# Safe to re-run — both underlying scripts are idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this as root (sudo bash installer/quickstart.sh)" >&2
  exit 1
fi

bash "${SCRIPT_DIR}/install.sh"
bash "${SCRIPT_DIR}/deploy.sh"
