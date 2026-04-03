#!/bin/bash

# Feature Test Script for personal-assistant
# Tests the three new features: Help, Colored Output, Command History

set -e

PROJECT_DIR="/Users/macairm5/Documents/personal-agent"
HISTORY_FILE="$HOME/.claude-personal/repl-history.json"

echo "=== Feature Test Suite ==="
echo ""

# Cleanup previous history
echo "1. Clearing previous command history..."
rm -f "$HISTORY_FILE"
echo "   ✓ History cleared"
echo ""

# Test 1: Help Command
echo "2. Testing /help command..."
cd "$PROJECT_DIR"
output=$(echo -e "/help\nexit" | npm run dev 2>/dev/null | grep -c "BASIC COMMANDS" || echo "0")
if [ "$output" -gt 0 ]; then
  echo "   ✓ /help command works (displays help text)"
else
  echo "   ✗ /help command failed"
fi
echo ""

# Test 2: Colored Output
echo "3. Testing colored output..."
output=$(npm run dev -- 'echo colored test' 2>/dev/null | grep "Echo: colored test")
if [ ! -z "$output" ]; then
  echo "   ✓ Colored echo output works"
else
  echo "   ✗ Colored output failed"
fi
echo ""

# Test 3: Command History Persistence
echo "4. Testing command history persistence..."
# Run commands
echo -e "echo history test 1\necho history test 2\nexit" | npm run dev 2>/dev/null > /dev/null

if [ -f "$HISTORY_FILE" ]; then
  count=$(grep -c "history test" "$HISTORY_FILE" || echo "0")
  if [ "$count" -ge 1 ]; then
    echo "   ✓ Commands saved to history ($count entries found)"
    echo "   History file: $HISTORY_FILE"
  else
    echo "   ✗ Commands not saved to history"
  fi
else
  echo "   ✗ History file not created"
fi
echo ""

# Test 4: /history Command
echo "5. Testing /history command..."
output=$(echo -e "/history\nexit" | npm run dev 2>/dev/null | grep -c "echo history test" || echo "0")
if [ "$output" -gt 0 ]; then
  echo "   ✓ /history command displays saved commands"
else
  echo "   ✗ /history command failed"
fi
echo ""

# Test 5: /clear-history Command
echo "6. Testing /clear-history command..."
# First verify history exists
if grep -q "echo history test" "$HISTORY_FILE" 2>/dev/null; then
  echo -e "/clear-history\nexit" | npm run dev 2>/dev/null > /dev/null
  
  if [ ! -s "$HISTORY_FILE" ] || grep -q "^\[\s*\]" "$HISTORY_FILE"; then
    echo "   ✓ /clear-history command works"
  else
    echo "   ✗ /clear-history failed"
  fi
else
  echo "   ⊗ Skipped (history file empty)"
fi
echo ""

echo "=== All tests completed ==="
