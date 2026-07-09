#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BRAND_A="${BRAND_A:-550e8400-e29b-41d4-a716-446655440000}"
BRAND_B="${BRAND_B:-660e8400-e29b-41d4-a716-446655440001}"
EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="StrongPassword123!"
EVENT_ID="evt_smoke_$(date +%s)"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

request() {
  local method="$1"
  local path="$2"
  shift 2
  local tmp
  tmp="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' \
      "$@"
  )"
  BODY="$(cat "$tmp")"
  rm -f "$tmp"
  STATUS="$status"
}

expect_status() {
  local expected="$1"
  local label="$2"
  if [[ "$STATUS" != "$expected" ]]; then
    red "FAIL: ${label} expected HTTP ${expected}, got ${STATUS}"
    printf '%s\n' "$BODY"
    exit 1
  fi
  green "OK: ${label} (${STATUS})"
}

json_field() {
  local field="$1"
  node -e '
    const body = JSON.parse(process.argv[1]);
    const field = process.argv[2];
    const value = body[field];
    if (value === undefined || value === null) {
      console.error(`missing field: ${field}`);
      process.exit(1);
    }
    if (typeof value === "object") {
      process.stdout.write(JSON.stringify(value));
    } else {
      process.stdout.write(String(value));
    }
  ' "$BODY" "$field"
}

wait_for_app() {
  step "Waiting for ${BASE_URL}"
  local i
  for i in $(seq 1 60); do
    if curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}/docs" | grep -Eq '^(200|301|302)$'; then
      green "App is up"
      return 0
    fi
    sleep 2
  done
  red "App did not become ready at ${BASE_URL}"
  exit 1
}

wait_for_app

step "Register brand A"
request POST /auth/register \
  -d "{\"brandId\":\"${BRAND_A}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
expect_status 201 "register brand A"
USER_A_ID="$(json_field id)"

step "Register same email in brand B"
request POST /auth/register \
  -d "{\"brandId\":\"${BRAND_B}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
expect_status 201 "register brand B"

step "Login brand A"
request POST /auth/login \
  -d "{\"brandId\":\"${BRAND_A}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
expect_status 200 "login brand A"
TOKEN_A="$(json_field accessToken)"

step "GET /profile/me"
request GET /profile/me \
  -H "Authorization: Bearer ${TOKEN_A}"
expect_status 200 "profile me"
PROFILE_BRAND="$(json_field brandId)"
PROFILE_ID="$(json_field id)"
if [[ "$PROFILE_BRAND" != "$BRAND_A" || "$PROFILE_ID" != "$USER_A_ID" ]]; then
  red "FAIL: profile tenant mismatch"
  exit 1
fi
green "OK: profile tenant matches brand A"

step "PSP callback accept"
request POST /webhooks/psp/stripe \
  -H "x-brand-id: ${BRAND_A}" \
  -H "x-correlation-id: smoke-corr-1" \
  -d "{\"eventId\":\"${EVENT_ID}\",\"type\":\"payment.succeeded\",\"amount\":1000}"
expect_status 201 "psp accept"
STATUS_FIELD="$(json_field status)"
RAW_EVENT_ID="$(json_field rawEventId)"
if [[ "$STATUS_FIELD" != "accepted" ]]; then
  red "FAIL: expected accepted, got ${STATUS_FIELD}"
  exit 1
fi

step "PSP callback duplicate"
request POST /webhooks/psp/stripe \
  -H "x-brand-id: ${BRAND_A}" \
  -d "{\"eventId\":\"${EVENT_ID}\",\"type\":\"payment.succeeded\",\"amount\":1000}"
expect_status 201 "psp duplicate"
STATUS_FIELD="$(json_field status)"
DUP_RAW_EVENT_ID="$(json_field rawEventId)"
if [[ "$STATUS_FIELD" != "duplicate" || "$DUP_RAW_EVENT_ID" != "$RAW_EVENT_ID" ]]; then
  red "FAIL: expected duplicate with same rawEventId"
  printf '%s\n' "$BODY"
  exit 1
fi
green "OK: idempotent duplicate"

step "Same eventId for brand B stays isolated"
request POST /webhooks/psp/stripe \
  -H "x-brand-id: ${BRAND_B}" \
  -d "{\"eventId\":\"${EVENT_ID}\",\"type\":\"payment.succeeded\",\"amount\":1000}"
expect_status 201 "psp brand B accept"
STATUS_FIELD="$(json_field status)"
BRAND_B_RAW_EVENT_ID="$(json_field rawEventId)"
if [[ "$STATUS_FIELD" != "accepted" || "$BRAND_B_RAW_EVENT_ID" == "$RAW_EVENT_ID" ]]; then
  red "FAIL: brand B should get a separate accepted event"
  exit 1
fi
green "OK: cross-brand isolation"

step "GSP callback"
request POST /webhooks/gsp/game-provider \
  -H "x-brand-id: ${BRAND_A}" \
  -d "{\"eventId\":\"gsp_${EVENT_ID}\",\"type\":\"round.finished\",\"roundId\":\"round_1\"}"
expect_status 201 "gsp accept"

printf '\n'
green "Smoke flow passed against ${BASE_URL}"
