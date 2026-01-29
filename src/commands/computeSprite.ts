import type { Logger } from "../logging";
import { loadConfig } from "../config";
import { findRepoRoot, resolveCwd } from "../fs/paths";
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
