# Research: Cloud VM integration with Fly.io Sprites

**Date**: 2025-01-22
**Item**: 001-cloud-vm-integration-with-flyio-sprites

## Research Question
Agent tasks currently run only on local machines, limiting scalability and requiring local resources.

**Motivation:** Enables remote execution, better resource management, and scalable compute for Wreckit agent tasks.

**Success criteria:**
- CLI commands work: `wreckit sprite status|resume|destroy`
- ComputeBackend interface supports both LocalBackend and SpritesBackend
- SpriteSessionStore persists session state correctly
- SpriteEnv loads SPRITE_TOKEN and GITHUB_TOKEN from multiple sources
- New `compute` and `limits` config sections validated

**Technical constraints:**
- Requires Fly.io account and SPRITE_TOKEN
- Requires GitHub token for repo operations
- Must maintain backward compatibility with local backend
- Base64 encoding for file sync operations

**In scope:**
- CLI sprite commands
- Backend abstraction layer
- Session persistence
- Environment token loading
- Config validation for new sections
- File sync (upload/download)
- Auto-delete and resume behavior
- Limits enforcement (iterations, duration, budget, progress)
**Out of scope:**
- Multi-region support
- Concurrent session limits enforcement
- Sprite image customization
- Credential rotation automation
- Built-in cost tracking (relies on Fly.io dashboard)

**Signals:** priority: high, urgency: Feature branch ready for testing

## Summary

The Wreckit codebase already has a **significant portion** of the Fly.io Sprites integration implemented, but it appears to be incomplete or not fully integrated. The core backend abstraction layer exists with both `LocalBackend` and `SpritesBackend` implementations, session persistence is in place, and environment loading works. However, the CLI commands mentioned in the success criteria (`status`, `resume`, `destroy`) are **missing**, and there's a discrepancy between the current implementation using `@fly/sprites` SDK and the item description mentioning "Wisp" (a different Sprites.dev CLI wrapper).

**Key findings:**
1. **Backend abstraction is complete** - `ComputeBackend` interface exists with `LocalBackend` and `SpritesBackend` implementations
2. **Session persistence works** - `SpriteSessionStore` properly saves/loads session state to `.wreckit/sessions/`
3. **Environment loading is implemented** - `SpriteEnv` loads tokens from multiple sources with proper precedence
4. **Config validation exists** - `compute` and `limits` sections are already defined in schemas with defaults
5. **Missing CLI commands** - Only `start`, `list`, `kill`, `attach`, `exec`, `pull` exist; `status`, `resume`, `destroy` are missing
6. **Two different Sprite implementations** - Current code uses `@fly/sprites` SDK, but `src/agent/sprite-core.ts` wraps a "Wisp" CLI (sprites.dev)
7. **File sync uses base64** - Already implemented in both sync approaches

## Current State Analysis

### Existing Implementation

The codebase has a well-structured compute backend abstraction layer:

**Backend Abstraction Layer (Complete):**
- `src/compute/ComputeBackend.ts:26-41` - Defines `ComputeBackend` interface with methods: `runIteration`, `sync`, `readState`, `writeResponse`, `cleanup`
- `src/compute/LocalBackend.ts:15-130` - Implements local execution using existing agent runner
- `src/compute/sprites/SpritesBackend.ts:28-396` - Implements Fly.io Sprites execution with session management
- `src/compute/resolveBackend.ts:14-53` - Factory function that resolves backend based on config

**Session Persistence (Complete):**
- `src/compute/sprites/SpriteSessionStore.ts:17-95` - Manages session state in `.wreckit/sessions/` directory
- Stores: `spriteId`, `repoSlug`, `itemId`, `createdAt`, `lastAccessedAt`, `status` (active/paused/completed/failed)
- Methods: `get`, `save`, `delete`, `list`, `touch` (for updating timestamps)
- Uses `safeWriteJson` for atomic writes

**Environment Token Loading (Complete):**
- `src/compute/sprites/SpriteEnv.ts:86-125` - `loadSpriteEnv()` function loads tokens from multiple sources
- Precedence (highest to lowest):
  1. `.wreckit/.sprite.env` file
  2. `.wreckit/config.local.json` agent.env section
  3. `process.env` (shell environment)
- Validates required tokens: `SPRITE_TOKEN`, `GITHUB_TOKEN`
- `parseSpriteEnvFile()` handles shell-style env files with comments and quotes

**Config Validation (Complete):**
- `src/schemas.ts:36-74` - Defines `ComputeConfigSchema`, `SpritesConfigSchema`, and `LimitsConfigSchema`
- `src/config.ts:196-227` - Merges config with defaults for `compute` and `limits` sections
- Default compute backend: `"local"`
- Default limits: `max_iterations: 100`, `max_duration_hours: 4`, `max_budget_usd: 20`, `no_progress_threshold: 3`
- Sprites config includes: `enabled`, `name_prefix`, `auto_delete`, `resume`, `workdir`, `env_file`, `copy_claude_credentials`, `github` config, `sync` paths

**File Sync (Complete):**
- `src/compute/sprites/SpritesBackend.ts:175-225` - `syncSinglePath()` method handles file upload/download
- Uses base64 encoding for safe binary transfer (lines 196-199, 217-219)
- Supports both files and directories
- Upload happens during sprite setup (lines 163-165)
- Download paths configured in `config.sync.download_paths`

**Auto-delete and Resume (Complete):**
- `src/compute/sprites/SpritesBackend.ts:86-129` - `ensureSprite()` checks for existing sessions
- Resume logic: if session exists and `config.resume` is true, reuses sprite (lines 93-106)
- Auto-delete: in `cleanup()` method (lines 373-395), deletes sprite if `config.auto_delete` is true and execution succeeded

**Limits Enforcement (Partially Complete):**
- Timeout enforced in `runIteration()` (lines 282-290) based on `max_duration_hours`
- Other limits (iterations, budget, progress) are NOT currently enforced in the implementation
- These are defined in config but not actively checked during execution

### Key Files

**Backend Abstraction:**
- `src/compute/ComputeBackend.ts:26-41` - Core interface defining backend contract
- `src/compute/LocalBackend.ts:15-130` - Local execution implementation
- `src/compute/sprites/SpritesBackend.ts:28-396` - Fly.io Sprites implementation
- `src/compute/resolveBackend.ts:14-53` - Backend factory function

**Session Management:**
- `src/compute/sprites/SpriteSessionStore.ts:17-95` - Session persistence layer
- `src/compute/sprites/SpriteSessionStore.ts:6-13` - Session schema with Zod validation

**Environment & Config:**
- `src/compute/sprites/SpriteEnv.ts:86-125` - Token loading with precedence
- `src/compute/sprites/SpriteEnv.ts:17-48` - Env file parsing (supports comments, quotes)
- `src/schemas.ts:36-74` - Config schemas for compute/limits
- `src/config.ts:196-227` - Config merging with defaults

**CLI Commands (Existing):**
- `src/commands/sprite.ts:1-630` - Existing sprite commands: `start`, `list`, `kill`, `attach`, `exec`, `pull`
- `src/index.ts:467-655` - CLI command registration

**File Sync Implementation:**
- `src/fs/sync.ts:118-412` - Alternative sync implementation using tar.gz archives and base64 encoding
- `src/agent/sprite-core.ts:1-378` - Wisp CLI wrapper (different from Fly.io Sprites SDK)

### Integration Points

**Agent Runner Integration:**
- `src/agent/runner.ts` - Main agent runner that uses backend abstraction
- `src/commands/run.ts` - Run command that should use backend
- `src/commands/phase.ts` - Phase commands that should use backend

**Config Loading:**
- `src/config.ts:312-355` - `loadConfig()` function that loads and validates config
- `src/config.ts:176-255` - `mergeWithDefaults()` applies defaults for compute/limits

**Error Handling:**
- `src/errors.ts:409-506` - Sprite-specific error classes already defined

## Technical Considerations

### Dependencies

**External Dependencies:**
- `@fly/sprites` - Fly.io Sprites SDK (currently used in SpritesBackend)
- Wisp CLI (sprites.dev) - Alternative implementation wrapped in `src/agent/sprite-core.ts`

**Internal Modules:**
- `src/compute/` - Backend abstraction layer
- `src/config.ts` - Config loading and validation
- `src/fs/sync.ts` - File synchronization utilities
- `src/agent/runner.ts` - Agent execution (needs to use backend)
- `src/commands/` - CLI commands (need to integrate with backend)

### Patterns to Follow

**Backend Resolution Pattern:**
- Use `resolveBackend()` from `src/compute/resolveBackend.ts` to get appropriate backend
- Check `config.compute.backend` to determine which backend to use
- Fallback to local if sprites not enabled (lines 32-36)

**Session Management Pattern:**
- Sessions stored in `.wreckit/sessions/<repoSlug>__<itemId>.json`
- Use URL encoding for repo slug to handle special characters
- Update `lastAccessedAt` on every session access

**Environment Loading Pattern:**
- Load from multiple sources with clear precedence
- Validate required tokens before creating backend
- Use redacted logging for sensitive tokens

**File Sync Pattern:**
- Use base64 encoding for binary-safe transfer
- Handle both files and directories recursively
- Use shell commands for efficiency (`mkdir -p`, `cat`, `base64`)

**CLI Command Pattern:**
- Use commander.js for CLI (already in use)
- Support `--json` flag for programmatic output
- Use `executeCommand()` wrapper for error handling
- Pass `logger` and `cwd` from global options

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Two conflicting Sprite implementations** | High | The codebase has both `@fly/sprites` SDK implementation (SpritesBackend) and Wisp CLI wrapper (sprite-core). Need to determine which is the correct approach and remove the other. |
| **Missing CLI commands** | Medium | Item specifies `status`, `resume`, `destroy` commands but only `start`, `list`, `kill`, `attach`, `exec`, `pull` exist. Need to implement missing commands. |
| **Limits not fully enforced** | Medium | Only timeout is enforced; iterations, budget, and progress limits are defined but not checked. Need to add enforcement logic. |
| **Sprite SDK dependency** | Medium | `@fly/sprites` package might not be in package.json or might be outdated. Need to verify dependency is properly installed. |
| **Session cleanup on failure** | Low | Auto-delete only happens on success; failed sessions might accumulate. Implement cleanup logic for stale sessions. |
| **Token exposure in logs** | Low | Tokens are currently redacted in some places but not all. Ensure consistent redaction. |
| **Concurrent session management** | Low | Item specifies this is out of scope, but session store doesn't prevent concurrent access. Document this limitation. |

## Recommended Approach

### Phase 1: Complete Missing CLI Commands

**1. Implement `wreckit sprite status` command:**
- Should display status of sprites for current repository
- Use `SpriteSessionStore.list()` to get all sessions
- Filter by current repo slug
- Display: item ID, sprite name, status, created time, last accessed time
- Support `--json` flag for programmatic output
- File: `src/commands/sprite.ts` (add new function and export)

**2. Implement `wreckit sprite resume <itemId>` command:**
- Should resume a paused session
- Use `SpriteSessionStore.get()` to fetch session
- Change status from "paused" to "active"
- Update `lastAccessedAt` timestamp
- If sprite no longer exists, recreate it
- File: `src/commands/sprite.ts`

**3. Implement `wreckit sprite destroy <itemId>` command:**
- Should destroy a sprite and delete its session
- Use `SpriteSessionStore.get()` to fetch session
- Call `sprite.delete()` via SpritesBackend or client
- Delete session file
- Support `--force` to destroy even if active
- File: `src/commands/sprite.ts`

**4. Register new commands in CLI:**
- Add command registrations in `src/index.ts` after existing sprite commands (around line 655)
- Follow existing pattern for `--json` flag and global options

### Phase 2: Add Missing Limits Enforcement

**1. Iteration limit enforcement:**
- In `SpritesBackend.runIteration()`, add iteration counter
- Check against `limits.max_iterations`
- Stop and yield error event if limit exceeded
- Store iteration count in session state

**2. Budget tracking (optional):**
- Fly.io Sprites SDK might provide cost information
- If available, track usage and compare to `limits.max_budget_usd`
- If not available, document as limitation

**3. Progress threshold enforcement:**
- Track meaningful progress indicators (files changed, tests passing, etc.)
- If no progress for `limits.no_progress_threshold` iterations, stop
- This is complex and may require heuristics

### Phase 3: Resolve Implementation Conflicts

**1. Determine correct Sprite implementation:**
- If using `@fly/sprites` SDK: remove `src/agent/sprite-core.ts` and related Wisp wrapper code
- If using sprites.dev CLI: update `SpritesBackend` to use sprite-core instead of direct SDK
- Document decision in code comments or README

**2. Update dependencies:**
- Verify `@fly/sprites` is in package.json if using SDK
- Or add sprites.dev CLI installation instructions if using Wisp

**3. Clean up unused code:**
- Remove old sync implementation in `src/fs/sync.ts` if not needed
- Remove sprite-specific commands from `src/commands/sprite.ts` if they're replaced by backend integration

### Phase 4: Integration Testing

**1. Test backend resolution:**
- Create config with `compute.backend: "sprites"`
- Verify `resolveBackend()` returns SpritesBackend
- Test fallback to local when sprites not enabled

**2. Test session persistence:**
- Run agent task with sprites backend
- Kill process and verify session saved
- Restart and verify session resumed

**3. Test file sync:**
- Create files in sprite VM
- Run sync download
- Verify files appear on host
- Modify files on host, upload, verify in VM

**4. Test CLI commands:**
- Test `status` displays sessions correctly
- Test `resume` reactivates paused sessions
- Test `destroy` removes sessions and sprites

## Open Questions

1. **Which Sprite implementation is correct?** The codebase has both `@fly/sprites` SDK (SpritesBackend.ts) and Wisp CLI wrapper (sprite-core.ts). Are these for different use cases, or should one be removed?

2. **Are the existing CLI commands sufficient?** The item specifies `status|resume|destroy` but the codebase has `start|list|kill|attach|exec|pull`. Are these equivalent (e.g., `kill` = `destroy`), or are the missing commands actually needed?

3. **What happened to the Wisp integration?** `src/agent/sprite-core.ts` wraps a "Wisp" CLI (sprites.dev), but `SpritesBackend` uses `@fly/sprites` SDK. Was this a migration in progress?

4. **Should limits be enforced by the backend or the runner?** Currently, limits are defined in config but not enforced. Should they be enforced in `SpritesBackend.runIteration()` or in a higher-level orchestration layer?

5. **Is the `@fly/sprites` package installed?** Need to verify it's in package.json and the correct version.

6. **What's the relationship between `agent.kind: "sprite"` and `compute.backend: "sprites"`?** These seem to overlap - are they the same thing or different?

7. **How should session cleanup work for failed tasks?** Currently, auto-delete only happens on success. Should there be a cleanup job for stale sessions?

8. **Should the `pull` command use the backend sync or the direct sync implementation?** There are two sync implementations - which one should be used?
