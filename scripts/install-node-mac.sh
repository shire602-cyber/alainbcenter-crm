#!/bin/bash
# Install Node.js on Mac and set up dependencies

set -e

echo "🔍 Checking for Node.js..."

# Check if node is already available
if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js is already installed:"
    node --version
    npm --version
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    exit 0
fi

# Check for Homebrew
if command -v brew >/dev/null 2>&1; then
    echo "🍺 Homebrew found. Installing Node.js via Homebrew..."
    brew install node
    echo "✅ Node.js installed!"
    node --version
    npm --version
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    exit 0
fi

# Check for NVM
if [ -d "$HOME/.nvm" ]; then
    echo "📦 NVM found. Loading NVM..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    if command -v nvm >/dev/null 2>&1; then
        echo "Installing latest LTS Node.js via NVM..."
        nvm install --lts
        nvm use --lts
        echo "✅ Node.js installed!"
        node --version
        npm --version
        echo ""
        echo "📦 Installing dependencies..."
        npm install
        exit 0
    fi
fi

# If nothing works, provide instructions
echo "❌ Node.js not found and no package manager detected."
echo ""
echo "Please install Node.js using one of these methods:"
echo ""
echo "1. Homebrew (recommended):"
echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
echo "   brew install node"
echo ""
echo "2. NVM (Node Version Manager):"
echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
echo "   nvm install --lts"
echo ""
echo "3. Direct download:"
echo "   Visit https://nodejs.org/ and download the installer"
echo ""
echo "After installing, run: npm install"

exit 1

