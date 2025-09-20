#!/bin/bash

# Prepare repository for GitHub deployment
# This script ensures only necessary files are committed

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Preparing VoiceBot for GitHub${NC}"
echo "===================================="
echo ""

# Check for sensitive files
echo -e "${YELLOW}Checking for sensitive data...${NC}"

# Check for API keys
if grep -r "sk-" . --exclude-dir=.git --exclude-dir=venv --exclude="*.md" --exclude-dir=__pycache__ --exclude="prepare-github.sh" 2>/dev/null | grep -v ".env.example" | grep -v "# Example"; then
    echo -e "${RED}❌ Found potential API keys in code! Please remove them.${NC}"
    exit 1
fi

# Check if .env exists and warn
if [ -f .env ]; then
    echo -e "${YELLOW}⚠️  Found .env file - making sure it's ignored${NC}"
    if ! grep -q "^.env$" .gitignore; then
        echo ".env" >> .gitignore
        echo -e "${GREEN}✅ Added .env to .gitignore${NC}"
    fi
fi

echo -e "${GREEN}✅ No sensitive data found${NC}"

# Clean up unnecessary files
echo -e "${YELLOW}Cleaning up temporary files...${NC}"

# Remove Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true

# Remove logs
rm -rf logs/*.log 2>/dev/null || true

# Remove local databases
rm -f data/*.db 2>/dev/null || true
rm -f data/*.sqlite 2>/dev/null || true
rm -rf data/chroma_db/* 2>/dev/null || true
rm -rf data/uploads/* 2>/dev/null || true

# Remove test files (optional - uncomment if desired)
# rm -f test_*.py 2>/dev/null || true
# rm -f debug_*.py 2>/dev/null || true

echo -e "${GREEN}✅ Cleaned temporary files${NC}"

# Initialize git if needed
if [ ! -d .git ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    git init
    echo -e "${GREEN}✅ Git repository initialized${NC}"
fi

# Add files to git
echo -e "${YELLOW}Adding files to git...${NC}"

# Add core files
git add src/ 2>/dev/null || true
git add public/ 2>/dev/null || true
git add data/api_config.json 2>/dev/null || true

# Add configuration
git add requirements.txt 2>/dev/null || true
git add package.json 2>/dev/null || true
git add .env.example 2>/dev/null || true
git add .gitignore 2>/dev/null || true

# Add deployment files
git add Dockerfile 2>/dev/null || true
git add docker-compose.yml 2>/dev/null || true
git add render.yaml 2>/dev/null || true
git add .dockerignore 2>/dev/null || true

# Add scripts
git add *.sh 2>/dev/null || true

# Add documentation
git add *.md 2>/dev/null || true
git add docs/ 2>/dev/null || true

# Add GitHub Actions
git add .github/ 2>/dev/null || true

echo -e "${GREEN}✅ Files added to git${NC}"

# Show status
echo ""
echo -e "${YELLOW}Git Status:${NC}"
git status --short

# Count files and size
FILE_COUNT=$(git ls-files | wc -l)
REPO_SIZE=$(du -sh .git 2>/dev/null | cut -f1)

echo ""
echo -e "${GREEN}Repository Statistics:${NC}"
echo "  Files tracked: $FILE_COUNT"
echo "  Repository size: $REPO_SIZE"

# Check for large files
echo ""
echo -e "${YELLOW}Checking for large files (>50MB)...${NC}"
LARGE_FILES=$(find . -type f -size +50M -not -path "./.git/*" -not -path "./venv/*" 2>/dev/null)
if [ -n "$LARGE_FILES" ]; then
    echo -e "${RED}⚠️  Found large files:${NC}"
    echo "$LARGE_FILES"
    echo -e "${YELLOW}Consider removing or adding to .gitignore${NC}"
else
    echo -e "${GREEN}✅ No large files found${NC}"
fi

echo ""
echo -e "${GREEN}===================================="
echo "✅ Repository prepared for GitHub!"
echo "====================================${NC}"
echo ""
echo "Next steps:"
echo "1. Review the files: git status"
echo "2. Commit changes: git commit -m 'Initial commit - VoiceBot Demo'"
echo "3. Add remote: git remote add origin https://github.com/YOUR_USERNAME/VoiceBot-Demo.git"
echo "4. Push to GitHub: git push -u origin main"
echo ""
echo -e "${YELLOW}Remember to:${NC}"
echo "  • Replace YOUR_USERNAME in README.md with your GitHub username"
echo "  • Add secrets to GitHub Settings → Secrets"
echo "  • Connect to Render.com for deployment"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}"