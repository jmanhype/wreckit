import type { Logger } from "../logging";
import type { WorkflowState } from "../schemas";
import { findRepoRoot, findRootFromOptions, getItemDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { loadConfig } from "../config";
import { FileNotFoundError, WreckitError, isWreckitError } from "../errors";
import {
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhaseCritique,
  runPhasePr,
  runPhaseComplete,
  type PhaseResult,
  type WorkflowOptions,
} from "../workflow";
import { formatDryRunPhase } from "./dryRunFormatter";
import {
  PHASE_REGISTRY,
  WORKFLOW_STATES,
  type PhaseName,
} from "../domain/states";

export type Phase =
  | "research"
  | "plan"
  | "implement"
  | "critique"
  | "pr"
  | "complete";

export interface PhaseOptions {
  force?: boolean;
  dryRun?: boolean;
  cwd?: string;
  sandbox?: boolean;
}

const PHASE_RUNNERS: Record<
  Phase,
  (itemId: string, options: WorkflowOptions) => Promise<PhaseResult>
> = {
  research: runPhaseResearch,
  plan: runPhasePlan,
  implement: runPhaseImplement,
  critique: runPhaseCritique,
  pr: runPhasePr,
  complete: runPhaseComplete,
};

/**
 * Configuration derived from PHASE_REGISTRY (single source of truth).
 */
function getPhaseConfig(phase: Phase): {
  requiredState: WorkflowState | WorkflowState[];
  targetState: WorkflowState;
  skipIfInTarget: boolean;
} {
  const spec = PHASE_REGISTRY.find((p) => p.name === phase);
  if (!spec) {
    throw new WreckitError(`Unknown phase: ${phase}`, "INVALID_STATE");
  }

  // implement and critique accept being re-entered from their own state
  if (phase === "implement") {
    return {
      requiredState: [spec.fromState, spec.toState],
      targetState: spec.toState,
      skipIfInTarget: false,
    };
  }
  if (phase === "critique") {
    return {
      requiredState: [spec.fromState, spec.toState],
      targetState: spec.toState,
      skipIfInTarget: true,
    };
  }

  return {
    requiredState: spec.fromState,
    targetState: spec.toState,
    skipIfInTarget: true,
  };
}

function isInRequiredState(
  currentState: WorkflowState,
  required: WorkflowState | WorkflowState[],
): boolean {
  if (Array.isArray(required)) {
    return required.includes(currentState);
  }
  return currentState === required;
}

function isInTargetState(
  currentState: WorkflowState,
  targetState: WorkflowState,
): boolean {
  return currentState === targetState;
}

/**
 * Validates whether a phase transition would be invalid.
 *
 * Uses WORKFLOW_STATES from the single source of truth (PHASE_REGISTRY-derived).
 */
function isInvalidTransition(
  phase: Phase,
  currentState: WorkflowState,
): boolean {
  const config = getPhaseConfig(phase);
  const currentIndex = WORKFLOW_STATES.indexOf(currentState);
  const targetIndex = WORKFLOW_STATES.indexOf(config.targetState);

  if (currentState === "done" && phase !== "complete") {
    return true;
  }

  if (currentIndex > targetIndex) {
    return true;
  }

  return false;
}

export async function runPhaseCommand(
  phase: Phase,
  itemId: string,
  options: PhaseOptions,
  logger: Logger,
): Promise<void> {
  const { force = false, dryRun = false, cwd, sandbox } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(root, sandbox ? { sandbox } : undefined);

  const itemDir = getItemDir(root, itemId);
  let item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }

  const phaseConfig = getPhaseConfig(phase);

  if (isInvalidTransition(phase, item.state)) {
    throw new WreckitError(
      `Cannot run ${phase} on item in state '${item.state}' - invalid transition`,
      "INVALID_TRANSITION",
    );
  }

  if (
    !force &&
    phaseConfig.skipIfInTarget &&
    isInTargetState(item.state, phaseConfig.targetState)
  ) {
    logger.info(
      `Item ${itemId} is already in state '${item.state}', skipping (use --force to override)`,
    );
    return;
  }

  if (
    !force &&
    !isInRequiredState(item.state, phaseConfig.requiredState) &&
    !isInTargetState(item.state, phaseConfig.targetState)
  ) {
    const requiredStr = Array.isArray(phaseConfig.requiredState)
      ? phaseConfig.requiredState.join("' or '")
      : phaseConfig.requiredState;
    throw new WreckitError(
      `Item is in state '${item.state}', expected '${requiredStr}' for ${phase} phase`,
      "INVALID_STATE",
    );
  }

  if (dryRun) {
    formatDryRunPhase(phase, item, phaseConfig.targetState, config, logger);
    return;
  }

  const workflowOptions: WorkflowOptions = {
    root,
    config,
    logger,
    force,
    dryRun,
  };

  const runner = PHASE_RUNNERS[phase];
  const result = await runner(itemId, workflowOptions);

  if (result.success) {
    console.log(
      `Successfully ran ${phase} phase on ${itemId}: ${item.state} → ${result.item.state}`,
    );
  } else {
    const errorMsg =
      typeof result.error === "string"
        ? result.error
        : (result.error?.message ?? `Phase ${phase} failed for ${itemId}`);

    // Re-throw if already a WreckitError, otherwise wrap
    if (isWreckitError(result.error)) {
      throw result.error;
    }
    throw new WreckitError(errorMsg, "PHASE_FAILED");
  }
}
