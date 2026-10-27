#!/usr/bin/env bash
# Chat Saver Desktop for macOS / Linux: ./chatsaver.sh [links...]   (./chatsaver.sh --login to sign in once)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js 18+ first (https://nodejs.org)"; exit 1; }
[ -d node_modules/playwright-core ] || npm install --no-audit --no-fund --silent
exec node chatsaver.mjs "$@"
