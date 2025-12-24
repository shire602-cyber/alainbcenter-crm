#!/bin/bash
# Quick Install Script for Mac
# Run this after Node.js is installed

set -e

echo "🚀 Installing Dual-LLM Routing Dependencies..."
echo ""

# Check if node is available
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js not found!"
    echo ""
    echo "Please install Node.js first:"
    echo "  1. Visit https://nodejs.org/ and download installer"
    echo "  2. Or install via Homebrew: brew install node"
    echo "  3. Or install via NVM: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo "✅ npm found: $(npm --version)"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.." || exit 1

echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "🔍 Verifying LLM setup..."
npm run verify-llm || echo "⚠️  Run 'npm run verify-llm' manually to check API keys"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  - Run tests: npm test"
echo "  - Start dev server: npm run dev"
echo "  - The dual-LLM routing is already integrated and will work automatically!"

