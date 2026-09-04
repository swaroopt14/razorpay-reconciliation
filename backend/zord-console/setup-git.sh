#!/bin/bash

# Git Configuration Script for swaroopt14
# Repository: https://github.com/Arealis-network/Arealis-Zord.git

cd "/Users/swaroopthakare/hackthon/zord ingestion frontend"

echo "🔧 Configuring Git with your GitHub account..."

# Set git user configuration
git config user.name "swaroopt14"
git config user.email "swaroopthakare@gmail.com"

echo "✅ Git user configured:"
echo "   Name: swaroopt14"
echo "   Email: swaroopthakare@gmail.com"
echo ""

# Check current remote
echo "📡 Checking current remote configuration..."
git remote -v
echo ""

# Remove old origin if exists
if git remote get-url origin &>/dev/null; then
    echo "🔄 Removing existing origin remote..."
    git remote remove origin
fi

# Add new remote
echo "➕ Adding new remote repository..."
git remote add origin https://github.com/Arealis-network/Arealis-Zord.git

echo "✅ Remote added:"
git remote -v
echo ""

# Check git status
echo "📊 Current git status:"
git status
echo ""

echo "✨ Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Review your changes: git status"
echo "2. Stage your changes: git add ."
echo "3. Commit: git commit -m 'Your commit message'"
echo "4. Push: git push -u origin main"
echo ""
echo "Note: You may need to authenticate with GitHub using a Personal Access Token"
echo "      Get one at: https://github.com/settings/tokens"
