import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { Item } from "../schemas";
import {
  findRepoRoot,
  findRootFromOptions,
  getItemDir,
  getResearchPath,
  getPlanPath,
  getPrdPath,
} from "../fs/paths";
import { pathExists } from "../fs/util";
import { readItem, writeItem } from "../fs/json";
import { loadConfig } from "../config";
import { FileNotFoundError, WreckitError, isWreckitError } from "../errors";
import {
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhaseCritique,
  runPhasePr,
  runPhaseComplete,
  getNextPhase,
  type WorkflowOptions,
} from "../workflow";
import { formatDryRunRun } from "./dryRunFormatter";
import {
  getPhaseEntryState,
  getPhaseSpec,
  type PhaseName,
} from "../domain/states";

export interface RunOptions {
  force?: boolean;
  dryRun?: boolean;
  mockAgent?: boolean;
  onAgentOutput?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  onIterationChanged?: (iteration: number, maxIterations: number) => void;
  onStoryChanged?: (story: { id: string; title: string } | null) => void;
  onPhaseChanged?: (phase: string | null) => void;
  cwd?: string;
  /** Disable automatic self-healing for this run (Item 038) */
  noHealing?: boolean;
  /** Run in sandbox mode with ephemeral Sprite VM */
  sandbox?: boolean;
}

async function phaseArtifactsExist(
  phase: string,
  root: string,
  itemId: string,
): Promise<boolean> {
  switch (phase) {
    case "research":
      return pathExists(getResearchPath(root, itemId));
    case "plan": {
      const planExists = await pathExists(getPlanPath(root, itemId));
      const prdExists = await pathExists(getPrdPath(root, itemId));
      return planExists && prdExists;
    }
    case "implement":
    case "critique":
    case "pr":
    case "complete":
      return false;
    default:
      return false;
  }
}

/**
 * Resolve the effective skip_phases for an item.
 * Per-item skip_phases override the global config.
 */
function resolveSkipPhases(
  item: Item,
  configSkipPhases: string[],
): PhaseName[] {
  const phases = item.skip_phases ?? configSkipPhases;
  return phases as PhaseName[];
}

export async function runCommand(
  itemId: string,
  options: RunOptions,
  logger: Logger,
): Promise<void> {
  const {
    force = false,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
    onIterationChanged,
    onStoryChanged,
    onPhaseChanged,
    cwd,
    noHealing = false,
    sandbox,
  } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(root, sandbox ? { sandbox } : undefined);

  const itemDir = getItemDir(root, itemId);
  let item: Item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }

  if (item.state === "done") {
    logger.info(`Item ${itemId} is already done`);
    return;
  }

  const skipPhases = resolveSkipPhases(item, config.skip_phases);
  if (skipPhases.length > 0) {
    logger.info(`Skipping phases: ${skipPhases.join(", ")}`);
  }

  const workflowOptions: WorkflowOptions = {
    root,
    config,
    logger,
    force,
    dryRun,
    mockAgent,
    onAgentOutput,
    onAgentEvent,
    onIterationChanged,
    onStoryChanged,
    onPhaseChanged,
    noHealing, // Pass through healing flag
  };

  const phaseRunners: Record<
    PhaseName,
    (id: string, opts: WorkflowOptions) => ReturnType<typeof runPhaseResearch>
  > = {
    research: runPhaseResearch,
    plan: runPhasePlan,
    implement: runPhaseImplement,
    critique: runPhaseCritique,
    pr: runPhasePr,
    complete: runPhaseComplete,
  };

  while (true) {
    item = await readItem(itemDir);

    if (item.state === "done") {
      logger.info(`Item ${itemId} completed successfully`);
      return;
    }

    const nextPhase = getNextPhase(item, skipPhases);
    if (!nextPhase) {
      logger.info(
        `Item ${itemId} is in state '${item.state}' with no next phase`,
      );
      return;
    }

    // Auto-advance: if phases were skipped, the item may need to fast-forward
    // to the entry state of the next real phase.
    const entryState = getPhaseEntryState(item.state, nextPhase);
    if (item.state !== entryState) {
      logger.info(
        `Fast-forwarding ${itemId}: ${item.state} → ${entryState} (skipped phases)`,
      );
      const advanced: Item = {
        ...item,
        state: entryState,
        updated_at: new Date().toISOString(),
      };
      await writeItem(itemDir, advanced);
      item = advanced;
    }

    if (!force && (await phaseArtifactsExist(nextPhase, root, itemId))) {
      logger.info(
        `Skipping ${nextPhase} phase (artifacts exist, use --force to regenerate)`,
      );
      const runner = phaseRunners[nextPhase];
      const result = await runner(itemId, { ...workflowOptions, force: false });
      if (!result.success) {
        const errorMsg =
          typeof result.error === "string"
            ? result.error
            : (result.error?.message ??
              `Phase ${nextPhase} failed for ${itemId}`);

        // Re-throw if already a WreckitError, otherwise wrap
        if (isWreckitError(result.error)) {
          throw result.error;
        }
        throw new WreckitError(errorMsg, "PHASE_FAILED");
      }
      continue;
    }

    if (dryRun) {
      formatDryRunRun(item, nextPhase, config, logger, skipPhases);
      return;
    }

    logger.info(`Running ${nextPhase} phase on ${itemId}`);

    // Map phase names to workflow states for TUI display
    const spec = getPhaseSpec(nextPhase);
    onPhaseChanged?.(spec?.toState ?? nextPhase);

    const runner = phaseRunners[nextPhase];
    const result = await runner(itemId, workflowOptions);

    if (!result.success) {
      const errorMsg =
        typeof result.error === "string"
          ? result.error
          : (result.error?.message ??
            `Phase ${nextPhase} failed for ${itemId}`);
      logger.error(`Phase ${nextPhase} failed for ${itemId}: ${errorMsg}`);

      // Re-throw if already a WreckitError, otherwise wrap
      if (isWreckitError(result.error)) {
        throw result.error;
      }
      throw new WreckitError(errorMsg, "PHASE_FAILED");
    }

    logger.info(
      `Completed ${nextPhase} phase: ${item.state} → ${result.item.state}`,
    );
  }
}
