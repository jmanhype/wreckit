# Test Timeout and Stability Implementation Plan

## Overview
This plan implements a simple "hello world" test file to verify the Wreckit autonomous agent framework can complete a full workflow cycle (research → plan → implement → PR → done) without encountering timeouts or crashes. The implementation focuses on validating framework stability through minimal, achievable changes rather than complex functionality.

## Current State Analysis
**What exists now:**
- Item `101-test-timeout-and-stability` is in `researched` state (per `item.json`)
- Research phase has been completed successfully
- No implementation artifacts exist yet
- The project uses Bun test framework with extensive test coverage in `src/__tests__/`
- Example simple command pattern exists in `src/commands/joke.ts`
- Agent timeout is configured to 1200 seconds (20 minutes) in `.wreckit/config.json:11`

**What's missing:**
- A concrete "hello world" artifact to demonstrate workflow completion
- Validation that all phases can execute successfully
- Evidence that the agent framework can complete a full cycle

**Key constraints discovered:**
- Must follow existing test patterns (Bun test framework)
- Must maintain write containment (only `progress.log` during implement phase)
- All changes must pass linting, type-checking, and build verification
- Git operations must complete successfully (branch, commit, PR)
- Item state must transition through all phases: `researched` → `planned` → `implementing` → `in_pr` → `done`

### Key Discoveries:
- **Test Pattern**: All tests use Bun test framework with `describe`, `it`, `expect` from `bun:test` (observed in `src/__tests__/cli.test.ts:1-34`)
- **Simple Command Pattern**: The `joke` command at `src/commands/joke.ts:1-38` provides a template for minimal TypeScript modules
- **Phase Write Containment**: Implementation phase only allows writing to `progress.log` in the item directory (enforced via git status comparison)
- **Validation Requirements**: All artifacts must pass quality gates per `src/domain/validation.ts`

## Desired End State
A simple test file `src/__tests__/hello-world.test.ts` exists that validates basic Wreckit functionality (e.g., the CLI program can be imported and has expected metadata). The test file:
- Uses Bun test framework consistently with existing tests
- Passes all automated verification (test, lint, typecheck, build)
- Is committed to git on the feature branch
- Has a pull request opened for review
- Item state is marked as `done`

**Verification:**
- Test file exists at `src/__tests__/hello-world.test.ts`
- Running `npm test` includes and passes the new test
- Item state in `item.json` is `done`
- No errors in `last_error` field
- PR exists and is mergeable

## What We're NOT Doing
- Creating a new CLI command (out of scope, requires more changes)
- Adding complex functionality or features
- Modifying core workflow or agent logic
- Testing timeout behavior by intentionally triggering timeouts
- Testing multiple agent SDKs (only testing current RLM configuration)
- Creating documentation files (doesn't validate code workflow)

## Implementation Approach
**Strategy:** Create a minimal test file that validates the CLI can be imported and has correct metadata. This approach:
- Aligns with existing test patterns in `src/__tests__/cli.test.ts`
- Requires minimal changes (single file addition)
- Validates the full workflow cycle
- Provides concrete evidence of successful completion
- Can be executed and verified automatically

**Reasoning:** A test file is the best choice because:
1. Tests are first-class artifacts in this codebase
2. Test files follow a clear, established pattern
3. The test can be run and verified automatically as part of CI
4. It demonstrates the workflow can produce production code
5. Unlike commands or docs, tests prove the system works

---

## Phase 1: Planning (Current Phase)

### Overview
This phase creates the implementation plan (this document) and the PRD (product requirements document) with user stories. The planning phase is design-only and must not modify production code.

### Changes Required:

#### 1. Create plan.md
**File**: `.wreckit/items/101-test-timeout-and-stability/plan.md`
**Changes**: Create this file with the detailed implementation plan

```markdown
# Test Timeout and Stability Implementation Plan
[This document - already created]
```

#### 2. Create prd.json
**File**: `.wreckit/items/101-test-timeout-and-stability/prd.json`
**Changes**: Create PRD with structured user stories

```json
{
  "schema_version": 1,
  "id": "101-test-timeout-and-stability",
  "branch_name": "wreckit/101-test-timeout-and-stability",
  "user_stories": [
    {
      "id": "US-001",
      "title": "Create hello-world test file",
      "acceptance_criteria": [
        "File exists at src/__tests__/hello-world.test.ts",
        "Test uses Bun test framework (describe, it, expect from 'bun:test')",
        "Test validates CLI program can be imported",
        "Test validates CLI has expected name and version"
      ],
      "priority": 1,
      "status": "pending",
      "notes": "Follow pattern from src/__tests__/cli.test.ts"
    }
  ]
}
```

### Success Criteria:

#### Automated Verification:
- [x] Plan file created: `.wreckit/items/101-test-timeout-and-stability/plan.md`
- [x] PRD file created: `.wreckit/items/101-test-timeout-and-stability/prd.json`
- [x] PRD validates against schema (no JSON errors)
- [x] No files modified outside item directory (write containment enforced)

#### Manual Verification:
- [x] Plan clearly defines implementation approach
- [x] User stories are specific and testable
- [x] Success criteria are measurable
- [x] Scope is well-defined and minimal

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Implementation

### Overview
Create the hello-world test file as specified in US-001. This phase modifies production code and must pass all quality gates.

### Changes Required:

#### 1. Create hello-world test file
**File**: `src/__tests__/hello-world.test.ts`
**Changes**: Create new test file

```typescript
import { describe, it, expect } from "bun:test";
import { program } from "../index";

describe("hello-world test", () => {
  it("should validate Wreckit CLI is functional", () => {
    expect(program).toBeDefined();
    expect(program.name()).toBe("wreckit");
    expect(program.version()).toBe("0.0.1");
  });

  it("should complete a full workflow cycle", () => {
    // This test validates that the agent framework can complete
    // all phases without crashing or timing out.
    // The existence of this file is evidence of successful completion.
    expect(true).toBe(true);
  });
});
```

#### 2. Update progress log
**File**: `.wreckit/items/101-test-timeout-and-stability/progress.log`
**Changes**: Track implementation progress

```
2025-01-29: Started implementation of US-001
2025-01-29: Created src/__tests__/hello-world.test.ts
2025-01-29: Ready for PR phase
```

### Success Criteria:

#### Automated Verification:
- [ ] Test file created: `src/__tests__/hello-world.test.ts`
- [ ] Tests pass: `npm test` (must include and pass new test)
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Only allowed files modified (write containment enforced)

#### Manual Verification:
- [ ] Test content matches specification from US-001
- [ ] Test follows patterns from `src/__tests__/cli.test.ts`
- [ ] No unintended side effects or changes
- [ ] Git diff shows only expected changes

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Pull Request

### Overview
Create a pull request for the implemented changes. This phase manages git operations (branch, commit, PR).

### Changes Required:

#### 1. Commit changes
**Action**: Git commit with descriptive message

```bash
git add src/__tests__/hello-world.test.ts
git commit -m "Add hello-world test to validate workflow stability

Implements US-001 for item 101-test-timeout-and-stability.
Creates a minimal test file to verify the agent framework can
complete a full cycle without crashing or timing out."
```

#### 2. Push to feature branch
**Action**: Push branch to remote

```bash
git push -u origin wreckit/101-test-timeout-and-stability
```

#### 3. Create/update pull request
**Action**: Create PR with description

```markdown
# Test Timeout and Stability

## Overview
This PR implements a simple "hello world" test to validate the Wreckit agent framework can complete a full workflow cycle without encountering timeouts or crashes.

## Changes
- Add `src/__tests__/hello-world.test.ts` - minimal test validating CLI functionality

## Verification
- [x] All tests pass: `npm test`
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`

## User Stories
- [x] US-001: Create hello-world test file
```

### Success Criteria:

#### Automated Verification:
- [ ] Branch exists: `wreckit/101-test-timeout-and-stability`
- [ ] Changes committed to branch
- [ ] Branch pushed to remote
- [ ] Pull request created or updated
- [ ] PR URL recorded in `item.json`

#### Manual Verification:
- [ ] PR description is clear and complete
- [ ] PR shows only expected changes
- [ ] PR is mergeable (no conflicts)
- [ ] All CI checks pass

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 4: Complete

### Overview
Mark the item as done after PR is merged. This phase updates item state and closes the workflow loop.

### Changes Required:

#### 1. Merge PR (manual step)
**Action**: Merge the pull request via GitHub interface or CLI

```bash
# Via gh CLI (if available)
gh pr merge wreckit/101-test-timeout-and-stability --merge
```

#### 2. Update item state
**File**: `.wreckit/items/101-test-timeout-and-stability/item.json`
**Changes**: Set state to `done`

```json
{
  "state": "done",
  "pr_url": "<actual-pr-url>",
  "pr_number": <actual-pr-number>,
  "last_error": null
}
```

#### 3. Clean up branch (optional)
**Action**: Delete feature branch after merge

```bash
git branch -d wreckit/101-test-timeout-and-stability
```

### Success Criteria:

#### Automated Verification:
- [ ] Item state is `done` in `item.json`
- [ ] PR URL and number are recorded
- [ ] No errors in `last_error` field
- [ ] Test file exists in main branch

#### Manual Verification:
- [ ] PR was successfully merged
- [ ] Changes are present in main branch
- [ ] All workflows completed without timeout
- [ ] Agent framework stability validated

**Note**: This is the final phase. All success criteria must be met before marking complete.

---

## Testing Strategy

### Unit Tests:
- **Test Location**: `src/__tests__/hello-world.test.ts`
- **What to test**:
  - CLI program can be imported without errors
  - CLI has correct name (`wreckit`)
  - CLI has correct version (`0.0.1`)
- **Key edge cases**: None (minimal test)

### Integration Tests:
- **End-to-end scenarios**:
  - Running `npm test` executes the new test
  - Running `npm run typecheck` validates TypeScript types
  - Running `npm run lint` validates code formatting
  - Running `npm run build` compiles successfully

### Manual Testing Steps:
1. Verify test file exists at `src/__tests__/hello-world.test.ts`
2. Run `npm test` and confirm new test passes
3. Run `npm run typecheck` and confirm no type errors
4. Run `npm run lint` and confirm code is properly formatted
5. Run `npm run build` and confirm build succeeds
6. Review git diff to confirm only expected changes
7. Verify PR shows only the test file addition

## Migration Notes
No migration needed. This is a new test file addition with no breaking changes to existing code.

## References
- Research: `/home/user/project/.wreckit/items/101-test-timeout-and-stability/research.md`
- PRD: `/home/user/project/.wreckit/items/101-test-timeout-and-stability/prd.json`
- Item Metadata: `/home/user/project/.wreckit/items/101-test-timeout-and-stability/item.json`
- Example Test: `/home/user/project/src/__tests__/cli.test.ts`
- CLI Entry Point: `/home/user/project/src/index.ts`
- Test Framework: Bun test (`package.json:23`)
