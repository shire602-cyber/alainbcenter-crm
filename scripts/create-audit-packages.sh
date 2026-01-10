#!/bin/bash

# AUDIT PACKAGING (safe, minimal, no secrets)
# Creates zip packages for Meta/Instagram/Webhook integration files and core DB/runtime config
# Safe: Only includes files tracked by git, no secrets or env vars

set -e

ROOT="$(pwd)"
OUTDIR="$ROOT/_audit_zips"
mkdir -p "$OUTDIR"

echo "==> Finding relevant files for Meta/Instagram/Webhook integration..."

# Check for Python 3 (required for zip creation)
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "❌ Error: Python 3 is required but not found. Please install Python 3."
    exit 1
fi

PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

# 1) Meta/Instagram/Webhook + Inbox ingestion focused files
# Updated patterns for Next.js app directory structure (src/app/api/)
META_FILES=$(git ls-files | grep -E '(^src/app/api/.*(webhooks|integrations|meta|instagram|ig|messag|inbox|thread|conversation|dm|lead).*\.(ts|tsx|js|jsx)$|^src/lib/.*(meta|instagram|ig|messag|inbox|thread|conversation|dm|webhook|lead|whatsapp|inbound).*\.(ts|tsx|js)$|^src/components/.*(integrations|meta|instagram|inbox).*\.(ts|tsx|js|jsx)$|^src/middleware\.(ts|js)$|^prisma/schema\.prisma$|^prisma/migrations/.*\.sql$|^package\.json$|^package-lock\.json$|^pnpm-lock\.yaml$|^yarn\.lock$|^next\.config\.(js|mjs|ts)$|^vercel\.json$|^tsconfig\.json$|^\.env\.example$|^README\.md$)' || true)

# Remove empty lines and sort
META_FILES=$(echo "$META_FILES" | sed '/^\s*$/d' | sort -u)

# Write list for review
echo "$META_FILES" > "$OUTDIR/meta_file_list.txt"
FILE_COUNT=$(echo "$META_FILES" | wc -l | tr -d ' ')
echo "==> Found $FILE_COUNT files for Meta/Instagram/Webhook bundle"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "⚠️  Warning: No files matched the patterns. Check repository structure."
    exit 1
fi

echo "==> Creating audit-meta-ig.zip ..."
cd "$ROOT"

# Create zip using Python (more reliable than system zip on some platforms)
$PYTHON_CMD <<'PY'
import os
import subprocess
import pathlib

root = os.getcwd()
outdir = os.path.join(root, "_audit_zips")
lst = os.path.join(outdir, "meta_file_list.txt")
zip_path = os.path.join(outdir, "audit-meta-ig.zip")

files = []
if os.path.exists(lst):
    with open(lst, "r") as f:
        for line in f:
            p = line.strip()
            if not p:
                continue
            full_path = os.path.join(root, p)
            if os.path.exists(full_path):
                files.append(p)

# Ensure deterministic order
files = sorted(set(files))

if not files:
    print("❌ Error: No files matched. Check repository structure.")
    raise SystemExit(1)

# Use system zip command (best compatibility)
# Change to root directory and use relative paths
os.chdir(root)
cmd = ["zip", "-r", "-9", zip_path] + files

try:
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    zip_size = os.path.getsize(zip_path) if os.path.exists(zip_path) else 0
    zip_size_mb = zip_size / (1024 * 1024)
    print(f"✅ Wrote: {zip_path}")
    print(f"   Files: {len(files)}")
    print(f"   Size: {zip_size_mb:.2f} MB")
except subprocess.CalledProcessError as e:
    print(f"❌ Error creating zip: {e.stderr}")
    raise SystemExit(1)
PY

# 2) Core DB/runtime config bundle (schema/migrations + ORM config)
echo ""
echo "==> Finding core database/runtime configuration files..."

CORE_FILES=$(git ls-files | grep -E '(^prisma/schema\.prisma$|^prisma/migrations/.*\.sql$|^next\.config\.(js|mjs|ts)$|^vercel\.json$|^package\.json$|^package-lock\.json$|^pnpm-lock\.yaml$|^yarn\.lock$|^tsconfig\.json$|^\.env\.example$|^README\.md$)' || true)

CORE_FILES=$(echo "$CORE_FILES" | sed '/^\s*$/d' | sort -u)
echo "$CORE_FILES" > "$OUTDIR/core_file_list.txt"
CORE_COUNT=$(echo "$CORE_FILES" | wc -l | tr -d ' ')
echo "==> Found $CORE_COUNT files for core runtime bundle"

if [ "$CORE_COUNT" -eq 0 ]; then
    echo "⚠️  Warning: No core files matched the patterns."
    exit 1
fi

echo "==> Creating audit-core-runtime.zip ..."

$PYTHON_CMD <<'PY'
import os
import subprocess

root = os.getcwd()
outdir = os.path.join(root, "_audit_zips")
lst = os.path.join(outdir, "core_file_list.txt")
zip_path = os.path.join(outdir, "audit-core-runtime.zip")

files = []
if os.path.exists(lst):
    with open(lst, "r") as f:
        for line in f:
            p = line.strip()
            if not p:
                continue
            full_path = os.path.join(root, p)
            if os.path.exists(full_path):
                files.append(p)

files = sorted(set(files))

if not files:
    print("❌ Error: No core files matched.")
    raise SystemExit(1)

os.chdir(root)
cmd = ["zip", "-r", "-9", zip_path] + files

try:
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    zip_size = os.path.getsize(zip_path) if os.path.exists(zip_path) else 0
    zip_size_mb = zip_size / (1024 * 1024)
    print(f"✅ Wrote: {zip_path}")
    print(f"   Files: {len(files)}")
    print(f"   Size: {zip_size_mb:.2f} MB")
except subprocess.CalledProcessError as e:
    print(f"❌ Error creating zip: {e.stderr}")
    raise SystemExit(1)
PY

echo ""
echo "==> Done. Audit packages created in: $OUTDIR"
echo ""
ls -lh "$OUTDIR"/*.zip 2>/dev/null || echo "No zip files found in output directory"
echo ""
echo "📦 Generated packages:"
echo "   - audit-meta-ig.zip: Meta/Instagram/Webhook integration files"
echo "   - audit-core-runtime.zip: Core database and runtime configuration"
echo ""
echo "✅ Audit packaging complete!"

