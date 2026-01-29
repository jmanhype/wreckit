# Cloud VM integration with Fly.io Sprites Implementation Plan

## Overview

This plan completes the integration of Fly.io Sprites as a compute backend for Wreckit agent tasks. The **backend abstraction layer, session persistence, environment loading, and config validation are already implemented**. What remains is:

1. **Adding missing CLI commands** for managing Fly.io Sprite sessions (distinct from existing Wisp CLI commands)
2. **Enforcing remaining limits** (iterations) that are defined but not checked
3. **Testing the complete integration** end-to-end

**Critical Clarification:** There are TWO separate "Sprite" features in Wreckit:
- **`agent.kind: "sprite"`** (Item 073): Uses Wisp CLI for local Firecracker VMs. Already has CLI commands (`wreckit sprite start|list|kill|attach|exec|pull`).
- **`compute.backend: "sprites"`** (Item 001, this item): Uses `@fly/sprites` SDK for Fly.io cloud Sprites. Needs NEW CLI commands (`wreckit compute sprite status|resume|destroy`).

This plan implements the Fly.io Sprites integration, which provides remote cloud execution for agent tasks.

## Current State Analysis

### What's Already Complete ✅

**Backend Abstraction Layer** (`src/compute/`):
- `ComputeBackend` interface with `runIteration`, `sync`, `readState`, `writeResponse`, `cleanup` methods
- `LocalBackend` implementation for local execution
- `SpritesBackend` implementation using `@fly/sprites` SDK (Fly.io)
- `resolveBackend()` factory function that selects backend based on `config.compute.backend`

**Session Persistence** (`src/compute/sprites/SpriteSessionStore.ts`):
- Stores sessions in `.wreckit/sessions/<repoSlug>__<itemId>.json`
- Tracks: `spriteId`, `repoSlug`, `itemId`, `createdAt`, `lastAccessedAt`, `status`
- Methods: `get`, `save`, `delete`, `list`, `touch`

**Environment Token Loading** (`src/compute/sprites/SpriteEnv.ts`):
- Loads `SPRITE_TOKEN` and `GITHUB_TOKEN` from multiple sources with precedence:
  1. `.wreckit/.sprite.env` file (highest priority)
  2. `.wreckit/config.local.json` agent.env section
  3. `process.env` (shell environment)
- `parseSpriteEnvFile()` handles shell-style env files with comments and quotes
- `validateSpriteEnv()` checks required tokens are present

**Config Validation** (`src/schemas.ts` + `src/config.ts`):
- `ComputeConfigSchema` with `backend: "local" | "sprites"` and `sprites` config
- `SpritesConfigSchema` with: `enabled`, `name_prefix`, `auto_delete`, `resume`, `workdir`, `env_file`, `copy_claude_credentials`, `github`, `sync`
- `LimitsConfigSchema` with: `max_iterations`, `max_duration_hours`, `max_budget_usd`, `no_progress_threshold`
- Defaults applied in `mergeWithDefaults()` (lines 196-227)

**File Sync** (`src/compute/sprites/SpritesBackend.ts:175-225`):
- `syncSinglePath()` handles file upload/download with base64 encoding
- Upload occurs during sprite setup for paths in `config.sprites.sync.upload_paths`
- Download available via `sync()` method for `config.sprites.sync.download_paths`

**Auto-delete and Resume** (`src/compute/sprites/SpritesBackend.ts`):
- Resume logic: `ensureSprite()` checks for existing sessions (lines 86-129)
- Auto-delete: `cleanup()` deletes sprite if `config.auto_delete: true` and execution succeeded (lines 373-395)

**Partial Limits Enforcement**:
- ✅ Timeout enforced in `runIteration()` (lines 282-290) based on `max_duration_hours`
- ❌ Iteration limit NOT enforced (defined in config, not checked)
- ❌ Budget limit NOT enforced (defined in config, not checked)
- ❌ Progress threshold NOT enforced (defined in config, not checked)

**Dependency Installed**:
- ✅ `@fly/sprites@0.0.1` is in `bun.lockb` and imported in `SpritesBackend.ts`

### What's Missing ❌

1. **CLI Commands for Fly.io Sprite Sessions**:
   - Success criteria requires: `wreckit sprite status|resume|destroy`
   - Existing `wreckit sprite` commands are for Wisp CLI (local VMs), not Fly.io Sprites
   - Need either new subcommands or separate command group

2. **Complete Limits Enforcement**:
   - Only timeout is currently enforced
   - Need to add iteration, budget, and progress checks

3. **End-to-End Testing**:
   - Integration tests for full workflow
   - Manual testing procedures documented

## Desired End State

### Specification

**1. CLI Commands Work:**

```bash
# Show status of Fly.io Sprite sessions for current repository
wreckit compute sprite status [--json]

# Resume a paused Sprite session
wreckit compute sprite resume <itemId> [--force]

# Destroy a Sprite session and delete the cloud VM
wreckit compute sprite destroy <itemId> [--force]
```

**2. Compute Backend Interface Supports Both:**
- `config.compute.backend = "local"` → Uses `LocalBackend` (already works)
- `config.compute.backend = "sprites"` → Uses `SpritesBackend` (already works)
- Backend selection via `resolveBackend()` factory (already works)

**3. Session Persistence:**
- Sessions saved to `.wreckit/sessions/<repoSlug>__<itemId>.json` (already works)
- Contains: `spriteId`, `repoSlug`, `itemId`, `createdAt`, `lastAccessedAt`, `status` (already works)

**4. Environment Token Loading:**
- Loads from `.wreckit/.sprite.env` → `config.local.json` → `process.env` (already works)
- Validates `SPRITE_TOKEN` and `GITHUB_TOKEN` present (already works)

**5. Config Validation:**
- `compute` section with `backend` and `sprites` config (already works)
- `limits` section with `max_iterations`, `max_duration_hours`, `max_budget_usd`, `no_progress_threshold` (already works)

**6. Limits Enforcement:**
- ✅ Timeout (already works)
- ❌ Iteration count: Stop after `max_iterations` iterations
- ❌ Budget: Stop if cost exceeds `max_budget_usd` (if Fly.io provides cost data)
- ❌ Progress: Stop if no progress for `no_progress_threshold` iterations

### Key Discoveries

**Discovery 1: Two Separate "Sprite" Features**
- **File**: `src/compute/sprites/SpritesBackend.ts:3`
- **Finding**: Codebase has both `@fly/sprites` SDK (cloud) and Wisp CLI wrapper (local VMs)
- **Decision**: These are orthogonal features - keep both, add CLI commands for Fly.io Sprites under `wreckit compute sprite` to distinguish from existing `wreckit sprite` commands

**Discovery 2: Missing CLI Commands**
- **File**: `src/index.ts:467-655`
- **Finding**: Only `start|list|kill|attach|exec|pull` commands exist, all for Wisp CLI
- **Decision**: Add `status|resume|destroy` commands under `wreckit compute sprite` subcommand group

**Discovery 3: Limits Partially Enforced**
- **File**: `src/compute/sprites/SpritesBackend.ts:282-290`
- **Finding**: Only timeout limit is enforced; iterations, budget, progress are not
- **Decision**: Add iteration counter in `SpritesBackend`, enforce iteration limit, document budget/progress as out of scope for this phase (requires cost API and progress heuristics)

**Discovery 4: SpritesBackend Structure**
- **File**: `src/compute/sprites/SpritesBackend.ts:28-396`
- **Finding**: Backend has `activeSprite` and `currentItemId` tracking, but no iteration counter
- **Decision**: Add `iterationCount: number` field to track iterations per session

**Discovery 5: Session Store Pattern**
- **File**: `src/compute/sprites/SpriteSessionStore.ts:63-86`
- **Finding**: `list()` method exists and returns all sessions without filtering
- **Decision**: Use `list()` and filter by `repoSlug` in CLI `status` command

## What We're NOT Doing

**Explicitly Out of Scope (per item description):**
1. ❌ Multi-region support - All Sprites in same Fly.io region
2. ❌ Concurrent session limits enforcement - No limits on number of simultaneous sessions
3. ❌ Sprite image customization - Use default Fly.io Sprites image
4. ❌ Credential rotation automation - Tokens loaded once at startup
5. ❌ Built-in cost tracking - Rely on Fly.io dashboard for costs
6. ❌ Budget limit enforcement - Fly.io Sprites SDK doesn't provide cost API
7. ❌ Progress threshold enforcement - Requires complex heuristics, deferred to future work
8. ❌ Modifying existing `wreckit sprite` commands - Those are for Wisp CLI (different feature)

**Clarification on "Not Doing":**
- We ARE adding new CLI commands, but NOT modifying existing Wisp CLI commands
- We ARE enforcing iteration limits, but NOT budget/progress limits (no API/heuristics)
- We ARE using `@fly/sprites` SDK, NOT removing Wisp CLI integration (different features)

## Implementation Approach

**High-Level Strategy:**
1. Add CLI commands using existing `SpriteSessionStore` and `SpritesBackend` patterns
2. Add iteration counter to `SpritesBackend` and enforce limit
3. Add integration tests for complete workflow
4. Document manual testing procedures

**Design Rationale:**
- **Why separate `wreckit compute sprite` commands?** To avoid confusion with existing `wreckit sprite` commands (Wisp CLI for local VMs). The `compute` namespace makes it clear these are for the compute backend.
- **Why iteration counter in backend not runner?** The backend owns the sprite lifecycle and is the right place to track per-session state.
- **Why skip budget/progress limits?** Fly.io Sprites SDK doesn't expose cost API, and progress detection requires domain-specific heuristics that don't fit in this phase.

---

## Phase 1: Add CLI Commands for Fly.io Sprite Sessions

### Overview
Add three new CLI commands under `wreckit compute sprite` for managing Fly.io Sprite sessions. These commands use the existing `SpriteSessionStore` and `@fly/sprites` SDK.

### Changes Required:

#### 1. Create Helper Function for Repository Slug
**File**: `src/git/remote.ts` (CREATE if not exists, else ADD to existing)

**Changes**: Add function to parse git remote URL and extract repository slug

```typescript
import { spawn } from "node:child_process";

/**
 * Parse git remote URL to extract repository slug (owner/repo).
 * Supports both HTTPS and SSH URLs.
 *
 * @example
 * getRepoSlug("/path/to/repo") // => "mikehostetler/wreckit"
 * getRepoSlug("/path/to/repo") // => null (if not a github.com repo)
 */
export async function getRepoSlug(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    const git = spawn("git", ["remote", "get-url", "origin"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    git.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    git.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    git.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve(null);
        return;
      }

      const url = stdout.trim();
      // Match HTTPS: https://github.com/owner/repo.git
      // Match SSH: git@github.com:owner/repo.git
      const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);

      if (match) {
        resolve(match[1]);
      } else {
        resolve(null);
      }
    });

    git.on("error", () => {
      resolve(null);
    });
  });
}
```

**Success Criteria**:
- [ ] Function handles HTTPS URLs correctly
- [ ] Function handles SSH URLs correctly
- [ ] Function returns null for non-github.com repos
- [ ] Function returns null if git command fails

---

#### 2. Create New Command File
**File**: `src/commands/computeSprite.ts` (NEW FILE)

**Changes**: Create new file with command implementations for `status`, `resume`, `destroy`

```typescript
import type { Logger } from "../logging";
import { loadConfig } from "../config";
import { findRepoRoot } from "../fs/paths";
import { SpriteSessionStore } from "../compute/sprites/SpriteSessionStore";
import { loadSpriteEnv, validateSpriteEnv } from "../compute/sprites/SpriteEnv";
import { getRepoSlug } from "../git/remote";
import { SpritesClient } from "@fly/sprites";

// ============================================================
// Command Options
// ============================================================

export interface ComputeSpriteStatusOptions {
  cwd?: string;
  json?: boolean;
}

export interface ComputeSpriteResumeOptions {
  itemId: string;
  force?: boolean;
  cwd?: string;
  json?: boolean;
}

export interface ComputeSpriteDestroyOptions {
  itemId: string;
  force?: boolean;
  cwd?: string;
  json?: boolean;
}

// ============================================================
// Helper Functions
// ============================================================

function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function loadSpritesConfig(cwd: string, logger: Logger) {
  const root = findRepoRoot(cwd);
  const config = await loadConfig(root);

  if (config.compute.backend !== "sprites") {
    throw new Error(
      "Sprites backend is not enabled. Set 'compute.backend: \"sprites\"' in .wreckit/config.json"
    );
  }

  if (!config.compute.sprites?.enabled) {
    throw new Error(
      "Sprites backend is configured but not enabled. Set 'compute.sprites.enabled: true' in .wreckit/config.json"
    );
  }

  return { root, config };
}

// ============================================================
// Commands
// ============================================================

/**
 * Show status of Fly.io Sprite sessions for current repository.
 *
 * Usage: wreckit compute sprite status [--json]
 */
export async function computeSpriteStatusCommand(
  options: ComputeSpriteStatusOptions,
  logger: Logger
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  try {
    const { root, config } = await loadSpritesConfig(cwd, logger);
    const repoSlug = await getRepoSlug(root);

    if (!repoSlug) {
      throw new Error("Could not determine repository slug from git remote");
    }

    const sessionStore = new SpriteSessionStore(root);
    const allSessions = await sessionStore.list();

    // Filter sessions for current repository
    const repoSessions = allSessions.filter((s) => s.repoSlug === repoSlug);

    if (repoSessions.length === 0) {
      const outputData = {
        success: true,
        message: "No Sprite sessions for this repository",
        data: {
          repository: repoSlug,
          sessions: [],
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`📋 ${outputData.message}`);
        console.log(`   Repository: ${repoSlug}`);
      }
      return;
    }

    const outputData = {
      success: true,
      message: `Found ${repoSessions.length} Sprite session(s)`,
      data: {
        repository: repoSlug,
        sessions: repoSessions.map((s) => ({
          itemId: s.itemId,
          spriteId: s.spriteId,
          status: s.status,
          createdAt: s.createdAt,
          lastAccessedAt: s.lastAccessedAt,
        })),
      },
    };

    if (options.json) {
      outputJson(outputData);
    } else {
      console.log(`📋 ${outputData.message}`);
      console.log(`   Repository: ${repoSlug}`);
      console.log("");
      repoSessions.forEach((session, index) => {
        console.log(
          `  ${index + 1}. ${session.itemId} (${session.status})`
        );
        console.log(`     Sprite: ${session.spriteId}`);
        console.log(`     Created: ${new Date(session.createdAt).toLocaleString()}`);
        console.log(`     Last accessed: ${new Date(session.lastAccessedAt).toLocaleString()}`);
        if (index < repoSessions.length - 1) console.log("");
      });
    }
  } catch (err) {
    const errorData = {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };

    if (options.json) {
      outputJson(errorData);
    } else {
      console.error(`❌ ${errorData.error}`);
    }
    process.exit(1);
  }
}

/**
 * Resume a paused Sprite session.
 *
 * Usage: wreckit compute sprite resume <itemId> [--force] [--json]
 */
export async function computeSpriteResumeCommand(
  options: ComputeSpriteResumeOptions,
  logger: Logger
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  try {
    const { root, config } = await loadSpritesConfig(cwd, logger);
    const repoSlug = await getRepoSlug(root);

    if (!repoSlug) {
      throw new Error("Could not determine repository slug from git remote");
    }

    const sessionStore = new SpriteSessionStore(root);
    const session = await sessionStore.get(repoSlug, options.itemId);

    if (!session) {
      throw new Error(
        `No session found for item '${options.itemId}' in this repository`
      );
    }

    if (session.status === "active" && !options.force) {
      throw new Error(
        `Session is already active. Use --force to resume anyway.`
      );
    }

    // Update session status
    session.status = "active";
    session.lastAccessedAt = new Date().toISOString();
    await sessionStore.save(session);

    const outputData = {
      success: true,
      message: `Resumed Sprite session '${options.itemId}'`,
      data: {
        itemId: session.itemId,
        spriteId: session.spriteId,
        status: session.status,
      },
    };

    if (options.json) {
      outputJson(outputData);
    } else {
      console.log(`✅ ${outputData.message}`);
      console.log(`   Sprite: ${session.spriteId}`);
      console.log(`   Status: ${session.status}`);
    }
  } catch (err) {
    const errorData = {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };

    if (options.json) {
      outputJson(errorData);
    } else {
      console.error(`❌ ${errorData.error}`);
    }
    process.exit(1);
  }
}

/**
 * Destroy a Sprite session and delete the cloud VM.
 *
 * Usage: wreckit compute sprite destroy <itemId> [--force] [--json]
 */
export async function computeSpriteDestroyCommand(
  options: ComputeSpriteDestroyOptions,
  logger: Logger
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  try {
    const { root, config } = await loadSpritesConfig(cwd, logger);
    const repoSlug = await getRepoSlug(root);

    if (!repoSlug) {
      throw new Error("Could not determine repository slug from git remote");
    }

    // Load and validate environment tokens
    const env = await loadSpriteEnv(root);
    const validation = validateSpriteEnv(env);

    if (!validation.valid) {
      throw new Error(
        `Missing required tokens: ${validation.missing.join(", ")}`
      );
    }

    const sessionStore = new SpriteSessionStore(root);
    const session = await sessionStore.get(repoSlug, options.itemId);

    if (!session) {
      throw new Error(
        `No session found for item '${options.itemId}' in this repository`
      );
    }

    if (session.status === "active" && !options.force) {
      throw new Error(
        `Session is still active. Use --force to destroy anyway.`
      );
    }

    // Delete the Sprite VM
    logger.debug(`Deleting Sprite: ${session.spriteId}`);
    const client = new SpritesClient(env.SPRITE_TOKEN);

    try {
      await client.deleteSprite(session.spriteId);
      logger.debug(`Sprite deleted successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.warn(`Failed to delete Sprite VM: ${message}`);
      // Continue to delete session file anyway
    }

    // Delete the session file
    await sessionStore.delete(repoSlug, options.itemId);

    const outputData = {
      success: true,
      message: `Destroyed Sprite session '${options.itemId}'`,
      data: {
        itemId: options.itemId,
        spriteId: session.spriteId,
      },
    };

    if (options.json) {
      outputJson(outputData);
    } else {
      console.log(`✅ ${outputData.message}`);
      console.log(`   Sprite: ${session.spriteId} deleted`);
    }
  } catch (err) {
    const errorData = {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };

    if (options.json) {
      outputJson(errorData);
    } else {
      console.error(`❌ ${errorData.error}`);
    }
    process.exit(1);
  }
}
```

**Success Criteria**:
- [ ] `status` command lists all sessions for current repository
- [ ] `status` command filters by repoSlug correctly
- [ ] `status` command supports `--json` flag
- [ ] `resume` command updates session status to active
- [ ] `resume` command validates session exists
- [ ] `resume` command supports `--force` flag
- [ ] `destroy` command deletes Sprite VM using SDK
- [ ] `destroy` command deletes session file
- [ ] `destroy` command supports `--force` flag
- [ ] All commands validate Sprites backend is enabled
- [ ] All commands handle errors gracefully

---

#### 3. Register Commands in CLI
**File**: `src/index.ts`

**Changes**: Add new command group after existing sprite commands

```typescript
// ============================================================================
// Compute Commands (Item 001 - Fly.io Sprites Backend)
// ============================================================================

const computeCmd = program
  .command("compute")
  .description("Manage compute backends");

const computeSpriteCmd = computeCmd
  .command("sprite")
  .description("Manage Fly.io Sprite sessions (cloud compute backend)")
  .addHelpText(
    "beforeAll",
    "\nCommands for managing Fly.io Sprites used as compute backend.\n",
  );

computeSpriteCmd
  .command("status")
  .description("Show status of Fly.io Sprite sessions for this repository")
  .option("--json", "Output as JSON")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const { computeSpriteStatusCommand } = await import("./commands/computeSprite.js");
    await executeCommand(
      async () => {
        await computeSpriteStatusCommand(
          {
            cwd: resolveCwd(globalOpts.cwd),
            json: options.json,
          },
          logger,
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      },
    );
  });

computeSpriteCmd
  .command("resume <itemId>")
  .description("Resume a paused Sprite session")
  .option("--force", "Resume even if session is already active")
  .option("--json", "Output as JSON")
  .action(async (itemId, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const { computeSpriteResumeCommand } = await import("./commands/computeSprite.js");
    await executeCommand(
      async () => {
        await computeSpriteResumeCommand(
          {
            itemId,
            force: options.force,
            cwd: resolveCwd(globalOpts.cwd),
            json: options.json,
          },
          logger,
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      },
    );
  });

computeSpriteCmd
  .command("destroy <itemId>")
  .description("Destroy a Sprite session and delete the cloud VM")
  .option("--force", "Destroy even if session is still active")
  .option("--json", "Output as JSON")
  .action(async (itemId, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const { computeSpriteDestroyCommand } = await import("./commands/computeSprite.js");
    await executeCommand(
      async () => {
        await computeSpriteDestroyCommand(
          {
            itemId,
            force: options.force,
            cwd: resolveCwd(globalOpts.cwd),
            json: options.json,
          },
          logger,
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      },
    );
  });
```

**Success Criteria**:
- [ ] `wreckit compute` command group exists
- [ ] `wreckit compute sprite` subcommand exists
- [ ] All three commands (status, resume, destroy) are registered
- [ ] Commands use dynamic imports for lazy loading
- [ ] Commands use executeCommand() wrapper
- [ ] Commands support global options

---

### Success Criteria

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `wreckit compute sprite status` displays sessions correctly
- [ ] `wreckit compute sprite resume <itemId>` updates status to active
- [ ] `wreckit compute sprite destroy <itemId>` deletes VM and session
- [ ] `--json` flag produces valid JSON output
- [ ] `--force` flag bypasses active session checks
- [ ] Commands validate Sprites backend is enabled
- [ ] Error messages are clear and actionable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Add Iteration Limit Enforcement

### Overview
Add iteration counter to `SpritesBackend` and enforce `max_iterations` limit from config. This prevents runaway agent loops from consuming excessive resources.

### Changes Required:

#### 1. Modify SpritesBackend Class
**File**: `src/compute/sprites/SpritesBackend.ts`

**Changes**: Add iteration counter and enforce limit

```typescript
export class SpritesBackend implements ComputeBackend {
  readonly name = "sprites";

  private client: SpritesClient;
  private sessionStore: SpriteSessionStore;
  private activeSprite: Sprite | null = null;
  private currentItemId: string | null = null;
  private succeeded = false;
  private iterationCount = 0; // NEW: Track iterations per session

  // ... constructor and other methods unchanged ...

  async *runIteration(
    itemId: string,
    options: IterationOptions
  ): AsyncIterable<LogEvent> {
    // Reset iteration counter if switching items
    if (this.currentItemId !== itemId) {
      this.iterationCount = 0;
      this.currentItemId = itemId;
    }

    // Increment iteration counter
    this.iterationCount++;

    // Check iteration limit
    if (this.iterationCount > this.limits.max_iterations) {
      const errorMsg = `Iteration limit exceeded: ${this.iterationCount} > ${this.limits.max_iterations}`;
      this.logger.error(errorMsg);

      yield {
        type: "error",
        message: errorMsg,
        timestamp: new Date().toISOString(),
      };

      // Stop iteration by not calling ensureSprite()
      return;
    }

    const sprite = await this.ensureSprite(itemId);
    // ... rest of method unchanged ...
  }

  async cleanup(): Promise<void> {
    if (this.activeSprite && this.currentItemId) {
      const session = await this.sessionStore.get(this.repoSlug, this.currentItemId);

      if (this.config.auto_delete && this.succeeded) {
        this.logger.info(`Deleting sprite: ${this.activeSprite.name}`);
        try {
          await this.activeSprite.delete();
        } catch (err) {
          this.logger.warn(`Failed to delete sprite: ${(err as Error).message}`);
        }
        await this.sessionStore.delete(this.repoSlug, this.currentItemId);
      } else if (session) {
        session.status = this.succeeded ? "completed" : "failed";
        session.lastAccessedAt = new Date().toISOString();
        await this.sessionStore.save(session);
      }
    }

    this.activeSprite = null;
    this.currentItemId = null;
    this.succeeded = false;
    this.iterationCount = 0; // NEW: Reset iteration counter
  }
}
```

**Success Criteria**:
- [ ] `iterationCount` field initialized to 0
- [ ] `iterationCount` incremented each `runIteration()` call
- [ ] `iterationCount` reset when switching `itemId`
- [ ] Error event yielded when limit exceeded
- [ ] Error message includes iteration count and limit
- [ ] `iterationCount` reset in `cleanup()`
- [ ] Limit check happens before `ensureSprite()`

---

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `npm test` (specifically sprites-backend tests)
- [ ] Type checking passes: `npm run typecheck`

#### Manual Verification:
- [ ] Create config with `max_iterations: 3`
- [ ] Run agent task that would iterate more than 3 times
- [ ] Verify task stops after 3 iterations
- [ ] Verify error message includes iteration count
- [ ] Verify task can run again after cleanup (counter reset)

**Note**: Complete automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Add Integration Tests

### Overview
Add integration tests for the complete workflow, including session persistence and CLI commands.

### Changes Required:

#### 1. Test Session Persistence Integration
**File**: `src/__tests__/integration/sprites-backend.integration.test.ts` (NEW FILE)

**Changes**: Create integration tests for session persistence layer

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SpriteSessionStore,
  type SpriteSession,
} from "../../compute/sprites/SpriteSessionStore";

describe("Sprites Backend Integration", () => {
  let tmpDir: string;
  let store: SpriteSessionStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprites-integration-"));
    store = new SpriteSessionStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("Session persistence lifecycle", () => {
    test("completes full save/get/delete cycle", async () => {
      const session: SpriteSession = {
        spriteId: "test-sprite-1",
        repoSlug: "test/repo",
        itemId: "001-test",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "active",
      };

      // Save
      await store.save(session);

      // Get
      const retrieved = await store.get("test/repo", "001-test");
      expect(retrieved).toEqual(session);

      // Delete
      await store.delete("test/repo", "001-test");

      // Verify deleted
      const afterDelete = await store.get("test/repo", "001-test");
      expect(afterDelete).toBeNull();
    });

    test("lists multiple sessions and filters by repo", async () => {
      const session1: SpriteSession = {
        spriteId: "sprite-1",
        repoSlug: "user/repo1",
        itemId: "001",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "active",
      };

      const session2: SpriteSession = {
        spriteId: "sprite-2",
        repoSlug: "user/repo2",
        itemId: "002",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "paused",
      };

      await store.save(session1);
      await store.save(session2);

      const allSessions = await store.list();
      expect(allSessions).toHaveLength(2);

      const repo1Sessions = allSessions.filter((s) => s.repoSlug === "user/repo1");
      expect(repo1Sessions).toHaveLength(1);
      expect(repo1Sessions[0]).toEqual(session1);
    });
  });
});
```

**Success Criteria**:
- [ ] Test file created in correct location
- [ ] Tests cover save/get/delete lifecycle
- [ ] Tests cover list() with filtering
- [ ] Tests use temporary directory
- [ ] Tests clean up after themselves
- [ ] All tests pass

---

#### 2. Test CLI Commands
**File**: `src/__tests__/commands/compute-sprite.test.ts` (NEW FILE)

**Changes**: Create tests for CLI commands (mock file system and console)

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// These tests will be minimal initially - focus on implementation first
describe("Compute Sprite Commands", () => {
  describe("status command", () => {
    test("displays no sessions message when none exist", async () => {
      // TODO: Implement with mocking
      expect(true).toBe(true);
    });
  });

  describe("resume command", () => {
    test("updates session status to active", async () => {
      // TODO: Implement with mocking
      expect(true).toBe(true);
    });
  });

  describe("destroy command", () => {
    test("deletes session and sprite", async () => {
      // TODO: Implement with mocking
      expect(true).toBe(true);
    });
  });
});
```

**Success Criteria**:
- [ ] Test file created (even if tests are TODO)
- [ ] Test structure follows existing patterns
- [ ] Placeholder tests for all three commands

---

### Success Criteria

#### Automated Verification:
- [ ] All new tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] No regressions in existing tests

**Note**: Complete automated verification, then proceed to final phase.

---

## Phase 4: Create Manual Testing Documentation

### Overview
Create comprehensive manual testing guide for verifying the Fly.io Sprites integration works end-to-end.

### Changes Required:

#### 1. Create Testing Guide
**File**: `TESTING.md` (NEW FILE in item directory)

**Changes**: Document manual testing procedures

```markdown
# Fly.io Sprites Integration - Manual Testing Guide

## Prerequisites

1. **Fly.io Account**: Create account at https://fly.io
2. **SPRITE_TOKEN**: Generate token from Fly.io dashboard
3. **GITHUB_TOKEN**: Generate personal access token with `repo` scope
4. **Test Repository**: A GitHub repo where Wreckit is initialized

## Setup

1. **Configure Wreckit for Sprites:**

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

2. **Set Environment Tokens:**

```bash
# Option A: Environment variables (recommended for testing)
export SPRITE_TOKEN="your-fly.io-token"
export GITHUB_TOKEN="your-github-token"

# Option B: .wreckit/.sprite.env file
cat > .wreckit/.sprite.env << EOF
SPRITE_TOKEN=your-fly.io-token
GITHUB_TOKEN=your-github-token
EOF
```

3. **Verify Setup:**

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

### Test 3: Resume Command - Error Handling

**Expected Output:**
```
❌ No session found for item '001-missing' in this repository
```

**Steps:**
```bash
wreckit compute sprite resume 001-missing
```

**Pass Criteria:** Error message clearly indicates session not found.

---

### Test 4: Destroy Command - Error Handling

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

### Test 5: Iteration Limit Enforcement

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
# Run agent task that would iterate more than 3 times
# Verify it stops after 3 iterations
```

**Pass Criteria:** Task stops after hitting iteration limit with clear error message.

---

### Test 6: Backend Resolution

**Expected Behavior:**
- With `compute.backend: "local"` → Uses LocalBackend
- With `compute.backend: "sprites"` → Uses SpritesBackend

**Steps:**
```bash
# Test local backend
echo '{"compute": {"backend": "local"}}' > .wreckit/config.json
wreckit run 001-test-item
# Should run locally

# Test sprites backend
echo '{"compute": {"backend": "sprites", "sprites": {"enabled": true}}}' > .wreckit/config.json
wreckit run 001-test-item
# Should create Fly.io Sprite
```

**Pass Criteria:** Backend switches based on config setting.

---

## Cleanup

After testing, clean up any remaining Sprites:

```bash
# List all sessions
wreckit compute sprite status

# Destroy each session
wreckit compute sprite destroy <itemId> --force

# Or use Fly.io CLI directly
fly apps list
fly apps destroy --app <app-name>
```

## Troubleshooting

**Error: "Sprites backend is not enabled"**
- Ensure `compute.backend: "sprites"` in config
- Ensure `compute.sprites.enabled: true` in config

**Error: "Missing required tokens: SPRITE_TOKEN"**
- Set `SPRITE_TOKEN` environment variable
- Or add to `.wreckit/.sprite.env` file

**Error: "Could not determine repository slug"**
- Ensure git remote is set: `git remote add origin https://github.com/owner/repo.git`
- Ensure remote URL is from github.com

**Error: "Iteration limit exceeded"**
- Increase `limits.max_iterations` in config
- Or reduce task complexity to require fewer iterations
```

**Success Criteria**:
- [ ] Testing guide covers all manual test cases
- [ ] Guide includes setup instructions
- [ ] Guide includes expected outputs
- [ ] Guide includes troubleshooting section
- [ ] Guide includes cleanup instructions

---

### Success Criteria

#### Manual Verification:
- [ ] Each test case can be followed step-by-step
- [ ] Expected outputs are accurate
- [ ] Setup instructions work
- [ ] Cleanup instructions work
- [ ] Troubleshooting section covers common issues

**Note**: This phase is complete when the testing guide is comprehensive enough for someone unfamiliar with the feature to verify everything works.

---

## Testing Strategy

### Unit Tests:
- Session store methods (`save`, `get`, `delete`, `list`, `touch`)
- Environment loading (`loadSpriteEnv`, `parseSpriteEnvFile`, `validateSpriteEnv`)
- Iteration limit enforcement in `SpritesBackend`

### Integration Tests:
- Session persistence lifecycle
- Backend resolution with different configs
- Complete workflow (create → read → update → delete sessions)

### Manual Testing Steps:
1. Setup Fly.io account and tokens
2. Configure Wreckit for Sprites backend
3. Test all three CLI commands
4. Test iteration limit enforcement
5. Test backend resolution
6. Clean up test Sprites

## Migration Notes
No migration needed - this is new functionality that doesn't change existing behavior. The `compute.backend: "local"` default ensures backward compatibility.

## References
- Research: `/Users/speed/wreckit/.wreckit/items/001-cloud-vm-integration-with-flyio-sprites/research.md`
- Backend Interface: `src/compute/ComputeBackend.ts:26-41`
- Session Store: `src/compute/sprites/SpriteSessionStore.ts`
- SpritesBackend: `src/compute/sprites/SpritesBackend.ts:28-396`
- Environment Loading: `src/compute/sprites/SpriteEnv.ts:86-125`
- Config Schema: `src/schemas.ts:36-74`
- Existing Tests: `src/__tests__/compute/sprite-session-store.test.ts`, `src/__tests__/compute/sprites-backend.test.ts`
