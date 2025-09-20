# GitHub Deployment Checklist

## ✅ Files to INCLUDE in GitHub

### Core Application Files
- [x] `src/` - All source code
  - `src/server.py` - Main server
  - `src/flight_handler.py` - Flight search handler
  - Other server files
- [x] `public/` - Static frontend files
  - HTML files
  - JavaScript files
  - CSS files
- [x] `data/api_config.json` - API configuration template

### Configuration Files
- [x] `.env.example` - Environment variable template
- [x] `requirements.txt` - Python dependencies  
- [x] `package.json` - Node dependencies (if any)

### Deployment Files
- [x] `Dockerfile` - Container configuration
- [x] `docker-compose.yml` - Docker orchestration
- [x] `render.yaml` - Render.com deployment
- [x] `.dockerignore` - Docker ignore rules

### Scripts
- [x] `manage_server.sh` - Server management
- [x] `deploy-free.sh` - Free deployment script
- [x] `deploy-aws.sh` - AWS deployment script
- [x] `aws-quickstart.sh` - AWS quick start

### Documentation
- [x] `README.md` - Main documentation
- [x] `CLAUDE.md` - AI assistant instructions
- [x] `AWS_DEPLOYMENT_GUIDE.md` - AWS guide
- [x] `FREE_HOSTING_GUIDE.md` - Free hosting guide
- [x] `FLIGHT_API_IMPROVEMENTS.md` - API documentation

## ❌ Files to EXCLUDE (in .gitignore)

### Sensitive Information
- [ ] `.env` - Contains API keys
- [ ] Any file with API keys or secrets
- [ ] `credentials.json`
- [ ] AWS credentials

### Generated/Runtime Files
- [ ] `__pycache__/`
- [ ] `*.pyc` files
- [ ] `venv/` - Virtual environment
- [ ] `logs/` - Log files
- [ ] `*.log`

### Local Data
- [ ] `data/chroma_db/` - Vector database
- [ ] `data/uploads/` - User uploads
- [ ] `*.db` - Database files
- [ ] `*.sqlite`

### Test Files (optional exclude)
- [ ] `test_*.py` - Test scripts
- [ ] `debug_*.py` - Debug scripts

### Large Files
- [ ] Audio files (`*.wav`, `*.mp3`)
- [ ] Binary files
- [ ] Archives (`*.zip`, `*.tar.gz`)

## 🔒 Security Check Before Push

```bash
# 1. Check for exposed secrets
grep -r "sk-" . --exclude-dir=venv --exclude-dir=.git
grep -r "OPENAI_API_KEY" . --exclude-dir=venv --exclude-dir=.git

# 2. Verify .env is ignored
git status --ignored | grep .env

# 3. Remove cached sensitive files if needed
git rm --cached .env
git rm --cached credentials.json

# 4. Check file sizes (GitHub limit: 100MB)
find . -type f -size +100M

# 5. Verify .gitignore is working
git check-ignore .env
```

## 📝 Pre-Push Commands

```bash
# 1. Update .gitignore
cat .gitignore

# 2. Remove sensitive files from tracking
git rm --cached .env
git rm --cached data/chroma_db/* 2>/dev/null || true
git rm --cached logs/* 2>/dev/null || true
git rm --cached __pycache__/* 2>/dev/null || true

# 3. Clean up test files (optional)
rm test_*.py
rm debug_*.py

# 4. Add essential files
git add src/
git add public/
git add requirements.txt
git add Dockerfile
git add docker-compose.yml
git add render.yaml
git add .gitignore
git add .env.example
git add README.md
git add *.md
git add *.sh

# 5. Check what will be committed
git status

# 6. Commit
git commit -m "Prepare for deployment - cleaned sensitive data"

# 7. Final check before push
git log --stat --oneline -1
```

## 🚀 GitHub Push Process

```bash
# 1. Create/verify remote
git remote -v
# If not set:
git remote add origin https://github.com/YOUR_USERNAME/VoiceBot-Demo.git

# 2. Push to GitHub
git push -u origin main

# 3. Verify on GitHub
# Go to: https://github.com/YOUR_USERNAME/VoiceBot-Demo
```

## 📋 Post-Push Setup

### 1. GitHub Repository Settings
- [ ] Add repository description
- [ ] Add topics: `voicebot`, `openai`, `realtime-api`, `python`, `websocket`
- [ ] Set up GitHub Pages (optional)
- [ ] Add `.github/workflows/` for CI/CD

### 2. Secrets Configuration
- [ ] Go to Settings → Secrets and Variables → Actions
- [ ] Add secret: `OPENAI_API_KEY`
- [ ] Add secret: `DOCKER_REGISTRY` (if using)

### 3. Deployment
- [ ] Connect to Render.com
- [ ] Or use GitHub Actions for auto-deploy
- [ ] Set up environment variables in hosting platform

## ⚠️ Important Reminders

1. **NEVER commit `.env` file** - Use `.env.example` instead
2. **Check for hardcoded secrets** in code
3. **Remove large files** (>100MB) before push
4. **Keep sensitive data local** only
5. **Use environment variables** for all secrets

## 🔍 Final Verification

```bash
# Show what's being tracked
git ls-files

# Show ignored files
git status --ignored

# Check repository size
du -sh .git

# Verify no secrets
git grep -i "api_key\|secret\|password" --cached
```

## ✅ Ready to Deploy!

If all checks pass, your repository is ready for GitHub and deployment!