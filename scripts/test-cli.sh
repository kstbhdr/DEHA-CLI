#!/bin/bash
# CLI Entegrasyon Testi (e2e)
# Kullanım: bash scripts/test-cli.sh

set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI="node $PROJECT_DIR/dist/index.js"
PASS=0
FAIL=0

green() { echo -e "\033[32m$1\033[0m"; }
red()   { echo -e "\033[31m$1\033[0m"; }

test_cli() {
  local desc="$1"
  local cmd="$2"
  shift 2
  echo -n "  Testing: $desc ... "
  
  if $cmd "$@" > /dev/null 2>&1; then
    green "✓ PASS"
    PASS=$((PASS + 1))
  else
    local exit_code=$?
    red "✗ FAIL (exit: $exit_code)"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Test Suite ──────────────────────────────────────────────────────────────

echo ""
echo "╔══ DEHA CLI Integration Tests ═══════════════════╗"
echo ""

test_cli "--help shows usage" "$CLI" --help
test_cli "--version shows version" "$CLI" --version
test_cli "doctor runs" "$CLI" doctor
test_cli "stats runs" "$CLI" stats

# Bilinmeyen komut exit code 1 dönmeli
echo -n "  Testing: unknown command fails with code 1 ... "
if $CLI nonexistent-command-xyz > /dev/null 2>&1; then
  red "✗ FAIL (should have failed)"
  FAIL=$((FAIL + 1))
else
  if [ $? -eq 1 ]; then
    green "✓ PASS"
    PASS=$((PASS + 1))
  else
    red "✗ FAIL (wrong exit code: $?)"
    FAIL=$((FAIL + 1))
  fi
fi

echo ""
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
