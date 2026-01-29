# Fly.io Sprites Integration - Manual Testing Guide

## Prerequisites

1. **Fly.io Account**: Create account at https://fly.io
2. **SPRITE_TOKEN**: Generate token from Fly.io dashboard
3. **GITHUB_TOKEN**: Generate personal access token with `repo` scope
4. **Test Repository**: A GitHub repo where Wreckit is initialized

## Setup

### 1. Configure Wreckit for Sprites

```bash
cd /path/to/test/repo
cat > .wreckit/config.json << 'EOF'
{
  "compute": {
    "backend": "sprites",
    "sprites": {
      "enabled": true,
      "name_prefix": "wreckit-test",
      "auto_delete": false,
      "resume": true
    }
  },
  "limits": {
    "max_iterations": 5,
    "max_duration_hours": 1
  }
}
EOF
```

### 2. Set Environment Tokens

**Option A: Environment variables (recommended for testing)**

```bash
export SPRITE_TOKEN="your-fly.io-token"
export GITHUB_TOKEN="your-github-token"
```

**Option B: .wreckit/.sprite.env file**

```bash
cat > .wreckit/.sprite.env << EOF
SPRITE_TOKEN=your-fly.io-token
GITHUB_TOKEN=your-github-token
EOF
```

### 3. Verify Setup

```bash
wreckit compute sprite status
# Should show: "No Sprite sessions for this repository"
```

## Test Cases

### Test 1: Status Command - No Sessions

**Expected Output:**
```
📋 No Sprite sessions for this repository
   Repository: owner/repo
```

**Steps:**
```bash
wreckit compute sprite status
```

**Pass Criteria:** Message displays "No Sprite sessions" with repository slug.

---

### Test 2: Status Command - JSON Output

**Expected Output:**
```json
{
  "success": true,
  "message": "No Sprite sessions for this repository",
  "data": {
    "repository": "owner/repo",
    "sessions": []
  }
}
```

**Steps:**
```bash
wreckit compute sprite status --json
```

**Pass Criteria:** Valid JSON with `success: true` and empty `sessions` array.

---

### Test 3: Status Command - Error Handling (Backend Not Enabled)

**Expected Output:**
```
❌ Sprites backend is not enabled. Set 'compute.backend: "sprites"' in .wreckit/config.json
```

**Steps:**
```bash
# Temporarily disable sprites backend
echo '{"compute": {"backend": "local"}}' > .wreckit/config.json
wreckit compute sprite status
```

**Pass Criteria:** Clear error message explaining how to enable Sprites backend.

---

### Test 4: Resume Command - Error Handling (Session Not Found)

**Expected Output:**
```
❌ No session found for item '001-missing' in this repository
```

**Steps:**
```bash
# Re-enable sprites backend first
echo '{"compute": {"backend": "sprites", "sprites": {"enabled": true}}}' > .wreckit/config.json
wreckit compute sprite resume 001-missing
```

**Pass Criteria:** Error message clearly indicates session not found.

---

### Test 5: Resume Command - Error Handling (Already Active)

**Expected Output:**
```
❌ Session is already active. Use --force to resume anyway.
```

**Steps:**
```bash
# First, manually create an active session file
mkdir -p .wreckit/sessions
cat > .wreckit/sessions/owner%2Frepo__001-test.json << 'EOF'
{
  "spriteId": "test-sprite-1",
  "repoSlug": "owner/repo",
  "itemId": "001-test",
  "createdAt": "2024-01-22T00:00:00.000Z",
  "lastAccessedAt": "2024-01-22T00:00:00.000Z",
  "status": "active"
}
EOF

wreckit compute sprite resume 001-test
```

**Pass Criteria:** Error message about session being active, suggesting --force flag.

---

### Test 6: Resume Command - Success with Active Session and --force

**Expected Output:**
```
✅ Resumed Sprite session '001-test'
   Sprite: test-sprite-1
   Status: active
```

**Steps:**
```bash
wreckit compute sprite resume 001-test --force
```

**Pass Criteria:** Success message confirming session resumed.

---

### Test 7: Destroy Command - Error Handling (Session Not Found)

**Expected Output:**
```
❌ No session found for item '001-missing' in this repository
```

**Steps:**
```bash
wreckit compute sprite destroy 001-missing
```

**Pass Criteria:** Error message clearly indicates session not found.

---

### Test 8: Destroy Command - Error Handling (Active Session Without --force)

**Expected Output:**
```
❌ Session is still active. Use --force to destroy anyway.
```

**Steps:**
```bash
# Using the active session from Test 5
wreckit compute sprite destroy 001-test
```

**Pass Criteria:** Error message about session being active, suggesting --force flag.

---

### Test 9: Destroy Command - Success (Cleans Up Session File)

**Expected Output:**
```
✅ Destroyed Sprite session '001-test'
   Sprite: test-sprite-1 deleted
```

**Steps:**
```bash
wreckit compute sprite destroy 001-test --force

# Verify session file is deleted
ls .wreckit/sessions/ | grep 001-test
# Should return nothing (file deleted)
```

**Pass Criteria:** Success message and session file removed from filesystem.

---

### Test 10: Iteration Limit Enforcement

**Prerequisites:**
- Create a test item that will iterate multiple times
- Set `max_iterations: 3` in config

**Expected Output:**
```
❌ Iteration limit exceeded: 4 > 3
```

**Steps:**
```bash
# Modify config to set low iteration limit
cat > .wreckit/config.json << 'EOF'
{
  "compute": {
    "backend": "sprites",
    "sprites": {
      "enabled": true,
      "name_prefix": "wreckit-test",
      "auto_delete": false,
      "resume": true
    }
  },
  "limits": {
    "max_iterations": 3,
    "max_duration_hours": 1
  }
}
EOF

# Run agent task that would iterate more than 3 times
# (This requires having an item that triggers multiple iterations)
# wreckit run 001-test-item
```

**Pass Criteria:** Task stops after hitting iteration limit with clear error message showing count and limit.

---

### Test 11: Backend Resolution - Local Backend

**Expected Behavior:**
- With `compute.backend: "local"` → Uses LocalBackend

**Steps:**
```bash
# Test local backend
echo '{"compute": {"backend": "local"}}' > .wreckit/config.json
# The wreckit run command should use local execution
# (This would be verified by checking logs for local execution messages)
```

**Pass Criteria:** Backend switches to local based on config setting.

---

### Test 12: Repository Slug Detection

**Expected Output:**
```
📋 No Sprite sessions for this repository
   Repository: owner/repo
```

**Steps:**
```bash
# Ensure git remote is set to a github.com URL
git remote add origin https://github.com/owner/repo.git
# OR
git remote add origin git@github.com:owner/repo.git

wreckit compute sprite status
```

**Pass Criteria:** Repository slug correctly parsed from git remote URL.

---

### Test 13: Non-GitHub Repository

**Expected Output:**
```
❌ Could not determine repository slug from git remote
```

**Steps:**
```bash
# Set a non-github.com remote
git remote add origin https://gitlab.com/owner/repo.git

wreckit compute sprite status
```

**Pass Criteria:** Error message indicating repository slug couldn't be determined.

---

## Cleanup

After testing, clean up any remaining Sprites and test files:

```bash
# 1. List all sessions
wreckit compute sprite status

# 2. Destroy each session
wreckit compute sprite destroy <itemId> --force

# 3. Clean up test session files
rm -rf .wreckit/sessions/

# 4. Reset config to local backend
echo '{"compute": {"backend": "local"}}' > .wreckit/config.json

# 5. Or use Fly.io CLI directly to clean up Sprites
fly apps list
fly apps destroy --app <app-name>
```

## Troubleshooting

### Error: "Sprites backend is not enabled"

**Cause:** `compute.backend` is not set to `"sprites"` in config.

**Solution:**
```bash
cat > .wreckit/config.json << 'EOF'
{
  "compute": {
    "backend": "sprites",
    "sprites": {
      "enabled": true
    }
  }
}
EOF
```

---

### Error: "Missing required tokens: SPRITE_TOKEN"

**Cause:** `SPRITE_TOKEN` environment variable is not set.

**Solution:**
```bash
export SPRITE_TOKEN="your-fly.io-token"
# OR add to .wreckit/.sprite.env
```

---

### Error: "Missing required tokens: GITHUB_TOKEN"

**Cause:** `GITHUB_TOKEN` environment variable is not set.

**Solution:**
```bash
export GITHUB_TOKEN="your-github-token"
# OR add to .wreckit/.sprite.env
```

---

### Error: "Could not determine repository slug"

**Cause:** Git remote is not set or URL doesn't match github.com pattern.

**Solution:**
```bash
# Check current remote
git remote -v

# Set github.com remote if needed
git remote add origin https://github.com/owner/repo.git
# OR for SSH
git remote set-url origin git@github.com:owner/repo.git
```

---

### Error: "Iteration limit exceeded"

**Cause:** Task exceeded `max_iterations` limit in config.

**Solution:**
```bash
# Increase limit in config
cat > .wreckit/config.json << 'EOF'
{
  "limits": {
    "max_iterations": 100
  }
}
EOF
```

---

### Issue: Sprite VM not deleted

**Cause:** `auto_delete` is set to `false` or task failed.

**Solution:**
```bash
# Manually destroy the session
wreckit compute sprite destroy <itemId> --force

# Or use Fly.io CLI directly
fly apps destroy --app <sprite-name>
```

---

## Notes

- **Session Persistence**: Sessions are stored in `.wreckit/sessions/<repoSlug>__<itemId>.json`
- **Repository Slug**: URL-encoded to handle special characters (e.g., `owner/repo` → `owner%2Frepo`)
- **Auto-delete**: Only happens on successful execution when `auto_delete: true`
- **Resume**: Sprites are reused if session exists and `resume: true` in config
- **Iteration Counter**: Resets when switching to a different item ID
- **Tokens**: Loaded from `.wreckit/.sprite.env` (highest priority) → `.wreckit/config.local.json` → `process.env` (lowest priority)

## Testing Checklist

- [ ] Prerequisites configured (Fly.io account, tokens, test repo)
- [ ] Config file set up with sprites backend enabled
- [ ] Environment tokens loaded correctly
- [ ] Status command works with no sessions
- [ ] Status command works with JSON output
- [ ] Resume command updates session status
- [ ] Resume command validates session exists
- [ ] Resume command supports --force flag
- [ ] Destroy command deletes session and sprite
- [ ] Destroy command validates session exists
- [ ] Destroy command supports --force flag
- [ ] Iteration limit enforced correctly
- [ ] Backend resolution works (local vs sprites)
- [ ] Repository slug detection works for HTTPS URLs
- [ ] Repository slug detection works for SSH URLs
- [ ] Error messages are clear and actionable
- [ ] All test sessions cleaned up
