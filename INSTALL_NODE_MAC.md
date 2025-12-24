# Install Node.js on Mac - Quick Guide

## Option 1: Install Homebrew + Node.js (Recommended)

Run these commands in your terminal:

```bash
# Install Homebrew (requires password)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add Homebrew to PATH (if on Apple Silicon Mac)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Install Node.js
brew install node

# Verify installation
node --version
npm --version

# Install project dependencies
cd /Users/arahm/alainbcenter-crm
npm install
```

## Option 2: Install NVM (Node Version Manager)

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell or run:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS
nvm install --lts
nvm use --lts

# Verify installation
node --version
npm --version

# Install project dependencies
cd /Users/arahm/alainbcenter-crm
npm install
```

## Option 3: Direct Download (Easiest)

1. Visit: https://nodejs.org/
2. Download the macOS installer (.pkg file)
3. Run the installer
4. Open a new terminal window
5. Run:
```bash
cd /Users/arahm/alainbcenter-crm
npm install
```

## After Installation

Once Node.js is installed, run:

```bash
# Install dependencies
cd /Users/arahm/alainbcenter-crm
npm install

# Verify LLM setup
npm run verify-llm

# Run tests
npm test
```

## Current Status

✅ **Code is ready** - All dual-LLM routing code is implemented
✅ **API keys configured** - As you mentioned, keys are in the system
⏳ **Waiting for Node.js** - Install Node.js using one of the methods above

The system will work automatically once Node.js is installed!

