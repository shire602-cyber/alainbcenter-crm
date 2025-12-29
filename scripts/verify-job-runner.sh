#!/bin/bash

# Verify Job Runner and Cron Setup
# Usage: ./scripts/verify-job-runner.sh [DOMAIN]

DOMAIN="${1:-your-domain.com}"
CRON_SECRET="${CRON_SECRET:-}"
JOB_RUNNER_TOKEN="${JOB_RUNNER_TOKEN:-}"

echo "🔍 Verifying Job Runner and Cron Setup"
echo "======================================"
echo "Domain: $DOMAIN"
echo ""

# Check if domain is provided
if [ "$DOMAIN" = "your-domain.com" ]; then
  echo "⚠️  Please provide your domain as first argument:"
  echo "   ./scripts/verify-job-runner.sh your-actual-domain.com"
  echo ""
  echo "Or set environment variables:"
  echo "   export CRON_SECRET=your-secret"
  echo "   export JOB_RUNNER_TOKEN=your-token"
  exit 1
fi

echo "1️⃣  Testing Job Runner Endpoint (/api/jobs/run-outbound)"
echo "--------------------------------------------------------"
if [ -z "$JOB_RUNNER_TOKEN" ]; then
  echo "⚠️  JOB_RUNNER_TOKEN not set - skipping direct job runner test"
  echo "   Set it: export JOB_RUNNER_TOKEN=your-token"
else
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "https://$DOMAIN/api/jobs/run-outbound?token=$JOB_RUNNER_TOKEN&max=10")
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Job Runner is accessible"
    echo "Response: $BODY"
  else
    echo "❌ Job Runner returned HTTP $HTTP_CODE"
    echo "Response: $BODY"
  fi
fi
echo ""

echo "2️⃣  Testing Cron Endpoint (/api/cron/run-outbound-jobs)"
echo "--------------------------------------------------------"
if [ -z "$CRON_SECRET" ]; then
  echo "⚠️  CRON_SECRET not set - testing without auth (will fail)"
  echo "   Set it: export CRON_SECRET=your-secret"
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "https://$DOMAIN/api/cron/run-outbound-jobs")
else
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "https://$DOMAIN/api/cron/run-outbound-jobs")
fi

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Cron endpoint is accessible"
  echo "Response: $BODY"
else
  echo "❌ Cron endpoint returned HTTP $HTTP_CODE"
  echo "Response: $BODY"
fi
echo ""

echo "3️⃣  Checking Vercel Cron Configuration"
echo "--------------------------------------------------------"
if [ -f "vercel.json" ]; then
  if grep -q "run-outbound-jobs" vercel.json; then
    echo "✅ vercel.json contains run-outbound-jobs cron configuration"
    echo ""
    echo "Cron configuration:"
    grep -A 5 "run-outbound-jobs" vercel.json | head -10
  else
    echo "⚠️  vercel.json does NOT contain run-outbound-jobs cron"
    echo "   You need to add it to vercel.json:"
    echo ""
    echo '   {'
    echo '     "crons": [{'
    echo '       "path": "/api/cron/run-outbound-jobs",'
    echo '       "schedule": "*/30 * * * * *"'
    echo '     }]'
    echo '   }'
  fi
else
  echo "⚠️  vercel.json not found"
fi
echo ""

echo "4️⃣  Checking Environment Variables"
echo "--------------------------------------------------------"
echo "Required env vars:"
echo "  - JOB_RUNNER_TOKEN: ${JOB_RUNNER_TOKEN:+✅ Set}${JOB_RUNNER_TOKEN:-❌ Not set}"
echo "  - CRON_SECRET: ${CRON_SECRET:+✅ Set}${CRON_SECRET:-❌ Not set}"
echo ""

echo "5️⃣  Manual Verification Steps"
echo "--------------------------------------------------------"
echo "To verify cron is running automatically:"
echo ""
echo "1. Check Vercel Dashboard:"
echo "   - Go to: https://vercel.com/dashboard"
echo "   - Your Project → Settings → Cron Jobs"
echo "   - Look for: /api/cron/run-outbound-jobs"
echo ""
echo "2. Check Vercel Logs:"
echo "   - Go to: Deployments → Latest → Functions Logs"
echo "   - Look for: '✅ Vercel cron request detected' or 'Job runner triggered'"
echo ""
echo "3. Check Database for Queued Jobs:"
echo "   - Query: SELECT COUNT(*) FROM \"OutboundJob\" WHERE status = 'queued';"
echo "   - If count decreases over time, cron is working"
echo ""

