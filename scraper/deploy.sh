#!/usr/bin/env bash
# Wypycha data.json do repo tylko wtedy, gdy faktycznie się zmienił.
# Token czytany z pliku, nigdy nie trafia do .git/config ani do logu.
set -euo pipefail

REPO="${FUT_REPO:-$HOME/AppEA}"
DATA="${FUT_DATA:-$HOME/fut-scraper/data.json}"
TOKEN_FILE="${FUT_TOKEN_FILE:-$HOME/.gh-token}"
REMOTE="${FUT_REMOTE:-github.com/patrykrekin/AppEA.git}"

[ -f "$TOKEN_FILE" ] || { echo "brak $TOKEN_FILE — pomijam deploy"; exit 0; }
TOKEN=$(tr -d '\r\n' < "$TOKEN_FILE")

cp "$DATA" "$REPO/data.json"
cd "$REPO"
git add data.json
git diff --cached --quiet && { echo "data.json bez zmian — nic nie wysyłam"; exit 0; }

git -c user.name="Terminal FUT" -c user.email="bot@terminal.fut" \
    commit -q -m "ceny $(date '+%d.%m %H:%M')"
git push -q "https://x-access-token:${TOKEN}@${REMOTE}" main
echo "wysłane: $(date '+%d.%m %H:%M')"
