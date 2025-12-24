#!/bin/bash

# Single Deployment Script
# This script ensures only ONE deployment per change by only pushing to master

set -e

echo "🚀 Starting single-deployment workflow..."

# Check if we're on dev branch
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "⚠️  Warning: Not on dev branch. Current branch: $CURRENT_BRANCH"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "❌ You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Get commit message
if [ -z "$1" ]; then
  echo "📝 Enter commit message:"
  read COMMIT_MSG
else
  COMMIT_MSG="$1"
fi

# Commit changes on dev
echo "📦 Committing changes on dev branch..."
git add -A
git commit -m "$COMMIT_MSG" || {
  echo "⚠️  No changes to commit"
}

# Switch to master and merge
echo "🔄 Switching to master and merging..."
git checkout master
git merge dev --no-edit

# Push to master (this triggers ONE deployment)
echo "🚀 Pushing to master (single deployment)..."
git push origin master

# Switch back to dev
echo "↩️  Switching back to dev branch..."
git checkout dev

echo "✅ Deployment complete! Only 1 deployment was triggered (from master push)."

