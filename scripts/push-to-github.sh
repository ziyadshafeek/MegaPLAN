#!/usr/bin/env bash
set -euo pipefail
REPO_URL="https://github.com/ziyadshafeek/MegaPLAN.git"
TMP_DIR="${TMPDIR:-/tmp}/freetoolforge-push-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone "$REPO_URL" "$TMP_DIR/repo" || true
if [ ! -d "$TMP_DIR/repo/.git" ]; then
  echo "Repository clone failed. Open GitHub and confirm the repository exists." >&2
  exit 1
fi
cp -a . "$TMP_DIR/repo/"
cd "$TMP_DIR/repo"
git add .
git commit -m "feat: bootstrap FreeToolForge and StudyBridge" || true
git branch -M main
git push -u origin main
echo "Pushed FreeToolForge to $REPO_URL"
