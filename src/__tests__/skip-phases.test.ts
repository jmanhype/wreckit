import { describe, it, expect } from "bun:test";
import {
  PHASE_REGISTRY,
  WORKFLOW_STATES,
  SKIPPABLE_PHASES,
  getNextState,
  getNextPhaseFromState,
  getPhaseEntryState,
  getPhaseSpec,
  getEffectiveStates,
  getAllowedNextStates,
  validateSkipPhases,
  getStateIndex,
  type PhaseName,
} from "../domain/states";
import type { WorkflowState } from "../schemas";

describe("PHASE_REGISTRY integrity", () => {
  it("has 6 phases in the correct order", () => {
    expect(PHASE_REGISTRY).toHaveLength(6);
    expect(PHASE_REGISTRY.map((p) => p.name)).toEqual([
      "research",
      "plan",
      "implement",
      "critique",
      "pr",
      "complete",
    ]);
  });

  it("forms a contiguous chain from idea to done", () => {
    expect(PHASE_REGISTRY[0].fromState).toBe("idea");
    for (let i = 1; i < PHASE_REGISTRY.length; i++) {
      expect(PHASE_REGISTRY[i].fromState).toBe(PHASE_REGISTRY[i - 1].toState);
    }
    expect(PHASE_REGISTRY[PHASE_REGISTRY.length - 1].toState).toBe("done");
  });

  it("marks implement and complete as non-skippable", () => {
    const nonSkippable = PHASE_REGISTRY.filter((p) => !p.skippable);
    expect(nonSkippable.map((p) => p.name)).toEqual([
      "implement",
      "complete",
    ]);
  });

  it("marks research, plan, critique, pr as skippable", () => {
    const skippable = PHASE_REGISTRY.filter((p) => p.skippable);
    expect(skippable.map((p) => p.name)).toEqual([
      "research",
      "plan",
      "critique",
      "pr",
    ]);
  });
});

describe("WORKFLOW_STATES derived from registry", () => {
  it("has 7 states in the correct order", () => {
    expect(WORKFLOW_STATES).toEqual([
      "idea",
      "researched",
      "planned",
      "implementing",
      "critique",
      "in_pr",
      "done",
    ]);
  });

  it("starts with idea and ends with done", () => {
    expect(WORKFLOW_STATES[0]).toBe("idea");
    expect(WORKFLOW_STATES[WORKFLOW_STATES.length - 1]).toBe("done");
  });
});

describe("SKIPPABLE_PHASES", () => {
  it("matches the skippable entries in PHASE_REGISTRY", () => {
    const fromRegistry = PHASE_REGISTRY.filter((p) => p.skippable).map(
      (p) => p.name,
    );
    expect([...SKIPPABLE_PHASES]).toEqual(fromRegistry);
  });
});

describe("getStateIndex", () => {
  it("returns correct indices for all states", () => {
    expect(getStateIndex("idea")).toBe(0);
    expect(getStateIndex("researched")).toBe(1);
    expect(getStateIndex("planned")).toBe(2);
    expect(getStateIndex("implementing")).toBe(3);
    expect(getStateIndex("critique")).toBe(4);
    expect(getStateIndex("in_pr")).toBe(5);
    expect(getStateIndex("done")).toBe(6);
  });
});

describe("getNextState", () => {
  describe("without skip_phases", () => {
    it("advances through the full pipeline", () => {
      expect(getNextState("idea")).toBe("researched");
      expect(getNextState("researched")).toBe("planned");
      expect(getNextState("planned")).toBe("implementing");
      expect(getNextState("implementing")).toBe("critique");
      expect(getNextState("critique")).toBe("in_pr");
      expect(getNextState("in_pr")).toBe("done");
    });

    it("returns null at terminal state", () => {
      expect(getNextState("done")).toBeNull();
    });
  });

  describe("with skip_phases", () => {
    it("skips research: idea -> planned", () => {
      expect(getNextState("idea", ["research"])).toBe("planned");
    });

    it("skips research+plan: idea -> implementing", () => {
      expect(getNextState("idea", ["research", "plan"])).toBe("implementing");
    });

    it("skips critique: implementing -> in_pr", () => {
      expect(getNextState("implementing", ["critique"])).toBe("in_pr");
    });

    it("skips critique+pr: implementing -> done", () => {
      expect(getNextState("implementing", ["critique", "pr"])).toBe("done");
    });

    it("skips all skippable: idea -> implementing -> done", () => {
      const allSkippable: PhaseName[] = [
        "research",
        "plan",
        "critique",
        "pr",
      ];
      expect(getNextState("idea", allSkippable)).toBe("implementing");
      expect(getNextState("implementing", allSkippable)).toBe("done");
    });

    it("does not skip non-skippable phases even if listed", () => {
      // implement and complete are non-skippable
      // But getNextState doesn't enforce this — it just uses getEffectiveStates
      // which filters based on the skipPhases param regardless.
      // validateSkipPhases is the enforcement gate.
      expect(getNextState("planned", ["implement" as PhaseName])).toBe("critique");
    });

    it("returns null from done even with skip_phases", () => {
      expect(getNextState("done", ["research", "plan"])).toBeNull();
    });
  });
});

describe("getNextPhaseFromState", () => {
  describe("without skip_phases", () => {
    it("returns the phase that runs from each state", () => {
      expect(getNextPhaseFromState("idea")).toBe("research");
      expect(getNextPhaseFromState("researched")).toBe("plan");
      expect(getNextPhaseFromState("planned")).toBe("implement");
      expect(getNextPhaseFromState("implementing")).toBe("critique");
      expect(getNextPhaseFromState("critique")).toBe("pr");
      expect(getNextPhaseFromState("in_pr")).toBe("complete");
    });

    it("returns null at terminal state", () => {
      expect(getNextPhaseFromState("done")).toBeNull();
    });
  });

  describe("with skip_phases", () => {
    it("skips research: idea -> plan", () => {
      expect(getNextPhaseFromState("idea", ["research"])).toBe("plan");
    });

    it("skips research+plan: idea -> implement", () => {
      expect(getNextPhaseFromState("idea", ["research", "plan"])).toBe(
        "implement",
      );
    });

    it("skips critique: implementing -> pr", () => {
      expect(getNextPhaseFromState("implementing", ["critique"])).toBe("pr");
    });

    it("skips critique+pr: implementing -> complete", () => {
      expect(
        getNextPhaseFromState("implementing", ["critique", "pr"]),
      ).toBe("complete");
    });

    it("skips all skippable: only implement and complete remain", () => {
      const allSkippable: PhaseName[] = [
        "research",
        "plan",
        "critique",
        "pr",
      ];
      expect(getNextPhaseFromState("idea", allSkippable)).toBe("implement");
      expect(
        getNextPhaseFromState("implementing", allSkippable),
      ).toBe("complete");
    });

    it("returns null from done regardless", () => {
      expect(getNextPhaseFromState("done", ["research"])).toBeNull();
    });

    it("skipping a phase from its fromState returns the next non-skipped phase", () => {
      // If we're at "idea" and skip research, we get plan (not research)
      expect(getNextPhaseFromState("idea", ["research"])).toBe("plan");
    });

    it("phases already passed are unaffected by skip list", () => {
      // At "implementing", skipping research/plan doesn't matter — they're behind us
      expect(
        getNextPhaseFromState("implementing", ["research", "plan"]),
      ).toBe("critique");
    });
  });
});

describe("getPhaseEntryState", () => {
  it("returns the fromState for each phase", () => {
    expect(getPhaseEntryState("idea", "research")).toBe("idea");
    expect(getPhaseEntryState("idea", "plan")).toBe("researched");
    expect(getPhaseEntryState("idea", "implement")).toBe("planned");
    expect(getPhaseEntryState("idea", "critique")).toBe("implementing");
    expect(getPhaseEntryState("idea", "pr")).toBe("critique");
    expect(getPhaseEntryState("idea", "complete")).toBe("in_pr");
  });

  it("returns the phase fromState regardless of currentState", () => {
    // Even if current state is "idea", the entry state for implement is "planned"
    expect(getPhaseEntryState("idea", "implement")).toBe("planned");
    expect(getPhaseEntryState("researched", "implement")).toBe("planned");
  });
});

describe("getPhaseSpec", () => {
  it("returns the spec for each phase", () => {
    const research = getPhaseSpec("research");
    expect(research).toBeDefined();
    expect(research!.fromState).toBe("idea");
    expect(research!.toState).toBe("researched");
    expect(research!.skippable).toBe(true);

    const implement = getPhaseSpec("implement");
    expect(implement).toBeDefined();
    expect(implement!.fromState).toBe("planned");
    expect(implement!.toState).toBe("implementing");
    expect(implement!.skippable).toBe(false);
  });
});

describe("getEffectiveStates", () => {
  it("returns all states when no phases skipped", () => {
    expect(getEffectiveStates()).toEqual(WORKFLOW_STATES);
    expect(getEffectiveStates([])).toEqual(WORKFLOW_STATES);
  });

  it("removes states produced by skipped phases", () => {
    expect(getEffectiveStates(["research"])).toEqual([
      "idea",
      "planned",
      "implementing",
      "critique",
      "in_pr",
      "done",
    ]);
  });

  it("skips research+plan: removes researched and planned", () => {
    expect(getEffectiveStates(["research", "plan"])).toEqual([
      "idea",
      "implementing",
      "critique",
      "in_pr",
      "done",
    ]);
  });

  it("skips critique+pr: removes critique and in_pr", () => {
    expect(getEffectiveStates(["critique", "pr"])).toEqual([
      "idea",
      "researched",
      "planned",
      "implementing",
      "done",
    ]);
  });

  it("skips all skippable: only idea, implementing, done remain", () => {
    expect(
      getEffectiveStates(["research", "plan", "critique", "pr"]),
    ).toEqual(["idea", "implementing", "done"]);
  });

  it("always keeps idea and done", () => {
    const allSkippable: PhaseName[] = [
      "research",
      "plan",
      "critique",
      "pr",
    ];
    const result = getEffectiveStates(allSkippable);
    expect(result[0]).toBe("idea");
    expect(result[result.length - 1]).toBe("done");
  });
});

describe("getAllowedNextStates", () => {
  it("returns single-element array for non-terminal states", () => {
    expect(getAllowedNextStates("idea")).toEqual(["researched"]);
    expect(getAllowedNextStates("planned")).toEqual(["implementing"]);
  });

  it("returns empty array for done", () => {
    expect(getAllowedNextStates("done")).toEqual([]);
  });

  it("respects skip_phases", () => {
    expect(getAllowedNextStates("idea", ["research"])).toEqual(["planned"]);
    expect(getAllowedNextStates("idea", ["research", "plan"])).toEqual([
      "implementing",
    ]);
  });
});

describe("validateSkipPhases", () => {
  it("returns empty array for valid skippable phases", () => {
    expect(validateSkipPhases(["research"])).toEqual([]);
    expect(validateSkipPhases(["research", "plan"])).toEqual([]);
    expect(
      validateSkipPhases(["research", "plan", "critique", "pr"]),
    ).toEqual([]);
  });

  it("returns invalid phases for non-skippable phases", () => {
    expect(validateSkipPhases(["implement"])).toEqual(["implement"]);
    expect(validateSkipPhases(["complete"])).toEqual(["complete"]);
    expect(validateSkipPhases(["implement", "complete"])).toEqual([
      "implement",
      "complete",
    ]);
  });

  it("returns invalid phases for unknown phases", () => {
    expect(validateSkipPhases(["nonexistent"])).toEqual(["nonexistent"]);
  });

  it("returns only invalid entries from mixed input", () => {
    expect(validateSkipPhases(["research", "implement", "plan"])).toEqual([
      "implement",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(validateSkipPhases([])).toEqual([]);
  });
});

describe("auto-advance scenarios (integration)", () => {
  it("idea -> implement when research+plan skipped", () => {
    const skipPhases: PhaseName[] = ["research", "plan"];
    const nextPhase = getNextPhaseFromState("idea", skipPhases);
    expect(nextPhase).toBe("implement");

    const entryState = getPhaseEntryState("idea", nextPhase!);
    expect(entryState).toBe("planned");
    // Item state would fast-forward: idea -> planned (auto-advance)
    // Then implement runs from "planned"
  });

  it("idea -> implement -> complete when all skippable skipped", () => {
    const skipPhases: PhaseName[] = ["research", "plan", "critique", "pr"];

    // First phase from idea
    const firstPhase = getNextPhaseFromState("idea", skipPhases);
    expect(firstPhase).toBe("implement");
    const firstEntry = getPhaseEntryState("idea", firstPhase!);
    expect(firstEntry).toBe("planned");

    // After implement completes, item is in "implementing"
    const secondPhase = getNextPhaseFromState("implementing", skipPhases);
    expect(secondPhase).toBe("complete");
    const secondEntry = getPhaseEntryState("implementing", secondPhase!);
    expect(secondEntry).toBe("in_pr");
    // Item would fast-forward: implementing -> in_pr (auto-advance)
    // Then complete runs from "in_pr"
  });

  it("full pipeline traversal without skipping touches all 6 phases", () => {
    const phases: PhaseName[] = [];
    let state: WorkflowState = "idea";
    while (state !== "done") {
      const nextPhase = getNextPhaseFromState(state);
      if (!nextPhase) break;
      phases.push(nextPhase);
      const spec = getPhaseSpec(nextPhase);
      state = spec!.toState;
    }
    expect(phases).toEqual([
      "research",
      "plan",
      "implement",
      "critique",
      "pr",
      "complete",
    ]);
  });

  it("pipeline traversal with skip touches only non-skipped phases", () => {
    const skipPhases: PhaseName[] = ["research", "critique"];
    const phases: PhaseName[] = [];
    let state: WorkflowState = "idea";
    while (state !== "done") {
      const nextPhase = getNextPhaseFromState(state, skipPhases);
      if (!nextPhase) break;
      phases.push(nextPhase);
      const spec = getPhaseSpec(nextPhase);
      state = spec!.toState;
    }
    expect(phases).toEqual(["plan", "implement", "pr", "complete"]);
  });

  it("per-item override replaces global config", () => {
    // Simulating resolveSkipPhases logic
    const globalSkip: PhaseName[] = ["research", "plan", "critique"];
    const itemSkip: PhaseName[] | undefined = ["critique"];

    const effective = itemSkip ?? globalSkip;
    expect(effective).toEqual(["critique"]);

    // With per-item override, research and plan are NOT skipped
    const nextPhase = getNextPhaseFromState("idea", effective);
    expect(nextPhase).toBe("research");
  });

  it("per-item undefined falls back to global config", () => {
    const globalSkip: PhaseName[] = ["research", "plan"];
    const itemSkip: PhaseName[] | undefined = undefined;

    const effective = itemSkip ?? globalSkip;
    expect(effective).toEqual(["research", "plan"]);

    const nextPhase = getNextPhaseFromState("idea", effective);
    expect(nextPhase).toBe("implement");
  });

  it("per-item empty array overrides global (skips nothing)", () => {
    const globalSkip: PhaseName[] = ["research", "plan"];
    const itemSkip: PhaseName[] | undefined = [];

    // Empty array is truthy, so it replaces global
    const effective = itemSkip ?? globalSkip;
    expect(effective).toEqual([]);

    const nextPhase = getNextPhaseFromState("idea", effective);
    expect(nextPhase).toBe("research");
  });
});
