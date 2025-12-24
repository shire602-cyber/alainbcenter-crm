# Deployment Workflow - Single Deployment Per Change

## Current Issue
- Pushing to `dev` → Vercel deploys (deployment #1)
- Merging to `master` → Vercel deploys again (deployment #2)

## Solution: Only Deploy from Master

**Workflow:**
1. Make changes on `dev` branch (local development)
2. When ready to deploy, merge to `master` and push
3. Vercel only watches `master` branch → **1 deployment**

## How to Deploy

```bash
# 1. Make changes on dev branch (local)
git checkout dev
# ... make changes ...
git add -A
git commit -m "your changes"

# 2. When ready to deploy, merge to master
git checkout master
git merge dev
git push origin master

# 3. Switch back to dev for next changes
git checkout dev
```

**Result:** Only 1 deployment (from master push)

## Alternative: Configure Vercel

In Vercel Dashboard:
1. Go to **Settings** → **Git**
2. Under **Production Branch**, ensure it's set to `master`
3. Under **Ignored Build Step**, you can add:
   ```
   git diff HEAD^ HEAD --quiet ./
   ```
   This will skip builds if no files changed (but won't prevent 2 deployments from 2 pushes)

## Best Practice

**For production deployments:**
- Only push to `master` when ready to deploy
- Use `dev` branch for development/testing
- Merge `dev` → `master` only when ready for production

