import type { WorkflowState } from "../schemas";

export type PhaseName =
  | "research"
  | "plan"
  | "implement"
  | "critique"
  | "pr"
  | "complete";

export const SKIPPABLE_PHASES: readonly PhaseName[] = [
  "research",
  "plan",
  "critique",
  "pr",
] as const;

export interface PhaseSpec {
  name: PhaseName;
  fromState: WorkflowState;
  toState: WorkflowState;
  skippable: boolean;
}

/**
 * The single source of truth for the phase pipeline.
 *
 * Every other phase/state ordering in the codebase is derived from this registry:
 * - WORKFLOW_STATES (derived below)
 * - getNextState() / getAllowedNextStates()
 * - getNextPhase() in src/workflow/itemWorkflow.ts
 * - PHASE_CONFIG in src/commands/phase.ts
 *
 * To add a new phase, add an entry here. Everything else follows.
 */
export const PHASE_REGISTRY: readonly PhaseSpec[] = [
  {
    name: "research",
    fromState: "idea",
    toState: "researched",
    skippable: true,
  },
  {
    name: "plan",
    fromState: "researched",
    toState: "planned",
    skippable: true,
  },
  {
    name: "implement",
    fromState: "planned",
    toState: "implementing",
    skippable: false,
  },
  {
    name: "critique",
    fromState: "implementing",
    toState: "critique",
    skippable: true,
  },
  { name: "pr", fromState: "critique", toState: "in_pr", skippable: true },
  { name: "complete", fromState: "in_pr", toState: "done", skippable: false },
];

/**
 * The canonical ordering of workflow states, derived from PHASE_REGISTRY.
 *
 * The state machine follows a linear progression:
 * idea -> researched -> planned -> implementing -> critique -> in_pr -> done
 */
export const WORKFLOW_STATES: WorkflowState[] = [
  "idea",
  ...PHASE_REGISTRY.map((p) => p.toState),
];

/**
 * Map from state to the phase that produces it (state is the phase's toState).
 */
const STATE_TO_PRODUCING_PHASE = new Map<WorkflowState, PhaseSpec>(
  PHASE_REGISTRY.map((p) => [p.toState, p]),
);

/**
 * Map from state to the phase that consumes it (state is the phase's fromState).
 */
const STATE_TO_CONSUMING_PHASE = new Map<WorkflowState, PhaseSpec>(
  PHASE_REGISTRY.map((p) => [p.fromState, p]),
);

export function getStateIndex(state: WorkflowState): number {
  return WORKFLOW_STATES.indexOf(state);
}

/**
 * Returns the effective state sequence after removing states produced by skipped phases.
 * Always includes "idea" (entry) and "done" (terminal).
 */
export function getEffectiveStates(
  skipPhases: PhaseName[] = [],
): WorkflowState[] {
  if (skipPhases.length === 0) return WORKFLOW_STATES;
  const skipSet = new Set(skipPhases);
  return WORKFLOW_STATES.filter((state) => {
    if (state === "idea" || state === "done") return true;
    const producer = STATE_TO_PRODUCING_PHASE.get(state);
    return !producer || !skipSet.has(producer.name);
  });
}

/**
 * Returns the next state in the workflow progression,
 * optionally skipping states produced by skipped phases.
 */
export function getNextState(
  current: WorkflowState,
  skipPhases: PhaseName[] = [],
): WorkflowState | null {
  const effective = getEffectiveStates(skipPhases);
  const index = effective.indexOf(current);
  if (index === -1 || index >= effective.length - 1) {
    return null;
  }
  return effective[index + 1];
}

/**
 * Returns the allowed next states for a given current state.
 * Wrapper around getNextState() that returns an array for API convenience.
 */
export function getAllowedNextStates(
  current: WorkflowState,
  skipPhases: PhaseName[] = [],
): WorkflowState[] {
  const next = getNextState(current, skipPhases);
  return next ? [next] : [];
}

export function isTerminalState(state: WorkflowState): boolean {
  return state === "done";
}

/**
 * Get the next phase to execute for an item, skipping phases in the skip list.
 *
 * Walks the PHASE_REGISTRY from the item's current state forward,
 * skipping any phases in skipPhases, until it finds one to run.
 *
 * This is the ONLY place that maps states to phases.
 */
export function getNextPhaseFromState(
  currentState: WorkflowState,
  skipPhases: PhaseName[] = [],
): PhaseName | null {
  if (currentState === "done") return null;
  const skipSet = new Set(skipPhases);
  let state: WorkflowState = currentState;

  for (const spec of PHASE_REGISTRY) {
    if (spec.fromState === state) {
      if (skipSet.has(spec.name)) {
        state = spec.toState;
        continue;
      }
      return spec.name;
    }
  }
  return null;
}

/**
 * Get the state an item needs to be in before running a given phase.
 * When phases are skipped, the item may need to fast-forward past
 * intermediate states to reach the entry state for the next real phase.
 */
export function getPhaseEntryState(
  currentState: WorkflowState,
  targetPhase: PhaseName,
): WorkflowState {
  const spec = PHASE_REGISTRY.find((p) => p.name === targetPhase);
  return spec ? spec.fromState : currentState;
}

/**
 * Look up a phase spec by name.
 */
export function getPhaseSpec(name: PhaseName): PhaseSpec | undefined {
  return PHASE_REGISTRY.find((p) => p.name === name);
}

/**
 * Validate that a skip_phases array only contains skippable phases.
 * Returns an array of invalid phase names.
 */
export function validateSkipPhases(phases: string[]): string[] {
  const skippableSet = new Set<string>(SKIPPABLE_PHASES);
  return phases.filter((p) => !skippableSet.has(p));
}
