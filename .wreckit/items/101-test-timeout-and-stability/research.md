# Research: Test Timeout and Stability

**Date**: 2025-01-29
**Item**: 101-test-timeout-and-stability

## Research Question
Create a simple 'hello world' file to verify the agent can complete a cycle without crashing or timing out.

## Summary

This item is a simple validation test to ensure the Wreckit agent workflow can complete a full cycle (research → plan → implement → PR → done) without encountering timeouts or crashes. The task is intentionally minimal - creating a basic "hello world" artifact - to focus on testing the agent framework stability rather than implementing complex functionality.

The analysis reveals this is a self-referential test: the item itself exists in the system (`.wreckit/items/101-test-timeout-and-stability/item.json`), and the goal is to verify the agent can process it through all phases. The "hello world" output could take several forms: a test file, a simple command, or documentation. Based on the project's existing patterns (e.g., `src/commands/joke.ts` for a simple command, extensive test suite in `src/__tests__/`), the most appropriate approach would be creating a simple test file or minimal artifact that demonstrates the workflow completes successfully.

The current item state is `idea` in `item.json`, meaning it's ready for the research phase. The agent configuration shows `timeout_seconds: 1200` (20 minutes) in `.wreckit/config.json:11`, providing adequate time for completion.

## Current State Analysis

### Existing Implementation

**Item Metadata:**
- The item exists at `.wreckit/items/101-test-timeout-and-stability/item.json:1-19` with state `"idea"`
- Created at `2026-01-29T00:40:00Z` (note: future timestamp suggests test data or clock skew)
- ID pattern: `101-test-timeout-and-stability` (items section, numeric prefix)
- Overview: "Create a simple 'hello world' file to verify the agent can complete a cycle without crashing or timing out"

**Project Structure:**
- This is the Wreckit CLI tool itself, a TypeScript-based autonomous agent framework
- Main entry point: `src/index.ts:1-50` - Commander.js CLI with multiple commands
- Workflow system: `src/workflow/itemWorkflow.ts` - manages phase transitions (research → plan → implement → pr → complete)
- Test infrastructure: `src/__tests__/workflow.test.ts:1-100` - extensive test coverage for workflow phases
- Agent runner: `src/agent/runner.ts` - abstract interface for multiple agent backends

**Current Agent Configuration:**
- Agent kind: `"rlm"` (`.wreckit/config.json:4`)
- Model: `"glm-4.7"` (`.wreckit/config.json:5`)
- Timeout: `1200` seconds (`.wreckit/config.json:11`)
- Completion signal: `"<promise>COMPLETE</promise>"` (`.wreckit/config.json:9`)

### Key Files

- `.wreckit/items/101-test-timeout-and-stability/item.json:1-19` - Current item metadata in `idea` state
- `.wreckit/config.json:1-14` - Agent configuration with 20-minute timeout
- `.wreckit/prompts/research.md:1-98` - Research phase prompt template that this document follows
- `specs/002-research-phase.md:1-200` - Comprehensive research phase specification
- `src/workflow/itemWorkflow.ts:1-500` - Core workflow orchestration logic
- `src/commands/joke.ts:1-38` - Example of a simple command (could be a model for hello world)
- `src/__tests__/workflow.test.ts:1-100` - Test patterns showing how phases are validated
- `src/domain/validation.ts` - Research quality validation (checks citations, sections)

## Technical Considerations

### Dependencies

**Internal Modules:**
- `src/workflow/itemWorkflow.ts` - Phase execution logic
- `src/domain/validation.ts` - Quality validation for research artifacts
- `src/agent/runner.ts` - Agent execution interface
- `src/agent/rlm-runner.ts` - RLM agent implementation
- `src/git/index.ts` - Git operations for branch/PR management

**External Dependencies:**
- TypeScript/Node.js 18+ (`package.json:104`)
- Commander.js for CLI (`package.json:67`)
- Test framework: Bun test (`package.json:23`)
- Agent SDKs: Multiple supported per `package.json:70-76` (Claude, Ax, OpenCode, Amp, Codex)

### Patterns to Follow

**Phase Transition Pattern:**
- Research phase validates output has required sections and citations (`specs/002-research-phase.md:95-110`)
- Write containment enforced via git status comparison before/after (`specs/002-research-phase.md:38-45`)
- Completion signal `<promise>COMPLETE</promise>` required from agent (`.wreckit/config.json:9`)

**Test Patterns:**
- Unit tests in `src/__tests__/` use Bun test framework
- Mock patterns in `src/__tests__/workflow.test.ts:12-100` show how to mock agent responses
- Validation tests check for specific file existence and content quality

**Item Structure:**
```
.wreckit/items/<id>/
├── item.json       # State and metadata
├── research.md     # This file (research output)
├── plan.md         # Planning phase output
├── prd.json        # User stories and acceptance criteria
└── progress.log    # Implementation tracking
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent timeout during research/plan/implement phases | Medium | Timeout set to 1200s (20 min) - sufficient for simple task |
| Agent crashes or hangs on complex operations | Medium | This is a simple "hello world" task, minimizing complexity |
| Quality validation fails (insufficient citations/depth) | High | Ensure research includes concrete file:line references from actual codebase |
| Git state comparison blocks legitimate writes | Low | Only `research.md` is allowed during research phase - already compliant |
| Agent SDK errors (RLM/GLM integration) | Medium | Fallback to other SDKs available (claude_sdk, amp_sdk, etc.) |
| State file corruption if agent interrupted | Low | Item state only advances on success; `last_error` field captures failures |

## Recommended Approach

Given the research findings, the recommended approach for implementing this test timeout and stability item:

1. **Hello World Artifact Options:**
   - **Option A (Recommended):** Create a simple test file at `src/__tests__/hello-world.test.ts` that validates basic functionality
   - **Option B:** Add a simple `hello` command to `src/commands/hello.ts` (similar to `joke.ts`)
   - **Option C:** Create a `HELLO_WORLD.md` documentation file in the project root

2. **Implementation Steps:**
   - Plan phase should define which option to pursue (recommend Option A for test alignment)
   - Implement phase creates the chosen artifact
   - PR phase opens a pull request for review
   - Complete phase marks item as done

3. **Success Criteria:**
   - Agent completes all phases without timeout
   - All artifacts created (`research.md`, `plan.md`, `prd.json`, hello world file)
   - Item state transitions: `idea` → `researched` → `planned` → `implementing` → `in_pr` → `done`
   - No errors in `last_error` field

4. **Stability Validation:**
   - Monitor execution time for each phase
   - Verify agent SDK connections remain stable
   - Confirm git operations (branch creation, commits, PR) complete successfully
   - Validate write containment (no unintended file modifications)

This approach directly tests the agent workflow while producing a useful, minimal artifact that aligns with the project's existing structure.

## Open Questions

1. **Which hello world artifact should be created?** The research presents three options; the planning phase should select one based on project needs. Test file (Option A) aligns best with existing patterns.

2. **Should this item validate timeout behavior or just complete under the timeout?** The item overview says "verify the agent can complete a cycle without crashing or timing out" - this suggests successful completion is the validation, not intentional timeout testing.

3. **Is the future timestamp in `created_at` (2026) intentional?** May indicate test data or clock skew. Does not affect workflow but worth noting for debugging.

4. **Should we test multiple agent SDKs or just RLM?** Current config uses RLM with GLM-4.7 model. Testing other SDKs (claude_sdk, amp_sdk) could provide broader stability validation but may be out of scope for a simple hello world test.
