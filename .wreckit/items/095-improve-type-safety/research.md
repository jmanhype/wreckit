# Research: Improve Type Safety

**Date**: 2025-01-09
**Item**: 095-improve-type-safety

## Research Question
Reduce excessive use of 'any' type casting (200+ instances), particularly in sprite-core.ts normalization logic and prompts.ts.

## Summary

The research reveals that the claim of "200+ instances" of `any` type usage appears to be significantly exaggerated. Based on comprehensive analysis of the codebase, the actual number of explicit `any` type annotations is much lower - approximately 15-20 instances across non-test files, with additional instances in test files (mostly for mock functionality).

The primary areas where `any` is used are:
1. **sprite-core.ts** - The `normalizeSprites()` function uses `any` for handling dynamic API responses from the Sprite CLI
2. **prompts.ts** - Uses `any` for dynamic variable access in template rendering
3. **sprite-runner.ts** - Uses `any` for error handling and tool call parsing
4. **commands/learn.ts** - Returns `any[]` for items (should use `Item[]`)
5. **commands/execute-roadmap.ts** - Uses `any` for sorting objectives
6. **schemas.ts** - Uses `z.any()` for MCP server configuration
7. **Test files** - Extensive use of `as any` for mocking (acceptable practice)

The `any` usages in production code can be categorized as:
- **API response handling** (legitimate use case for external APIs)
- **Template variable access** (could be improved with proper types)
- **Error handling** (could be improved with better error types)
- **Test mocking** (acceptable and standard practice)

## Current State Analysis

### Existing Implementation

#### 1. sprite-core.ts:182-197 - normalizeSprites function
**Location**: `src/agent/sprite-core.ts:182-197`

```typescript
function normalizeSprites(data: any): any {
  if (!data) return data;

  // Handle API response: {"sprites": [...]}
  let sprites = Array.isArray(data) ? data : data.sprites || [data];

  if (!Array.isArray(sprites)) return data;

  return sprites.map((s: any) => ({
    ...s,
    // Map status (API) to state (CLI/Wreckit)
    state:
      s.state ||
      (s.status === "warm" || s.status === "hot" || s.status === "running"
        ? "running"
        : "stopped"),
  }));
}
```

**Issues:**
- Function signature uses `any` for both parameter and return type
- Internal logic uses `any` for sprite objects
- No proper type definition for the Sprite API response format
- The function actually has well-defined structure but lacks type annotations

**Should be:**
```typescript
interface WispApiResponse {
  sprites?: WispSpriteInfo[];
  [key: string]: unknown;
}

function normalizeSprites(data: unknown): WispSpriteInfo[] {
  // Implementation with proper type guards
}
```

#### 2. prompts.ts:58-64 - Template variable access
**Location**: `src/prompts.ts:58-64`

```typescript
result = result.replace(
  /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
  (_, varName, content) => {
    const value = (variables as any)[varName];
    return value ? content : "";
  },
);
```

**Issues:**
- Uses `(variables as any)[varName]` to access dynamic property names
- This is a legitimate use case but could be improved with proper typing

**Should be:**
```typescript
const value = (variables as Record<string, unknown>)[varName];
```

#### 3. sprite-runner.ts:119-120 - Error handling
**Location**: `src/agent/sprite-runner.ts:119-120`

```typescript
function handleAxAIError(error: any, logger: Logger): string {
  const msg = error instanceof Error ? error.message : String(error);
  // ...
}
```

**Issues:**
- Parameter type is `any` but function handles both Error and non-Error types
- Could use `unknown` instead

**Should be:**
```typescript
function handleAxAIError(error: unknown, logger: Logger): string {
```

#### 4. sprite-runner.ts:128 - Tool call parsing
**Location**: `src/agent/sprite-runner.ts:128`

```typescript
function parseToolCalls(content: string, logger: Logger): Array<{ name: string; args: any }> {
```

**Issues:**
- `args` should have a proper type (likely `Record<string, unknown>`)

**Should be:**
```typescript
function parseToolCalls(content: string, logger: Logger): Array<{ name: string; args: Record<string, unknown> }> {
```

#### 5. commands/learn.ts:31 - Return type
**Location**: `src/commands/learn.ts:31`

```typescript
): Promise<{ items: any[]; context: string }> {
```

**Issues:**
- Returns `any[]` for items, but should use `Item[]` type from schemas

**Should be:**
```typescript
): Promise<{ items: Item[]; context: string }> {
```

#### 6. commands/execute-roadmap.ts:79 - Sorting
**Location**: `src/commands/execute-roadmap.ts:79`

```typescript
const sorted = [...milestoneObjectives].sort(
  (a, b) => (a as any).index - (b as any).index,
);
```

**Issues:**
- The `index` property exists but isn't part of the inferred type
- This indicates a missing property in the type definition

**Should be:**
The returned type from `extractPendingObjectives` and `extractAllObjectives` should include the `index` property explicitly.

#### 7. schemas.ts:257 - MCP server configuration
**Location**: `src/schemas.ts:257`

```typescript
mcp_servers: z
  .record(z.string(), z.any())
  .optional()
  .describe("MCP servers to attach (advanced usage)"),
```

**Issues:**
- Uses `z.any()` which is intentionally flexible for MCP server configurations
- This is actually reasonable since MCP servers can have arbitrary configuration
- Could be improved with a more specific type if MCP server configs are well-defined

**Should be:**
```typescript
mcp_servers: z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .optional()
  .describe("MCP servers to attach (advanced usage)"),
```

### Key Files

1. **`src/agent/sprite-core.ts`** - Sprite CLI wrapper with normalization logic
   - Line 182-197: `normalizeSprites()` function with `any` parameters
   - High priority for type safety improvement

2. **`src/prompts.ts`** - Prompt template rendering
   - Line 58-64: Dynamic variable access using `as any`
   - Line 71: Similar pattern for `#ifnot` blocks
   - Medium priority - minor improvement needed

3. **`src/agent/sprite-runner.ts`** - Sprite agent runner
   - Line 119-120: Error handling with `any` parameter
   - Line 128: Tool call parsing with `any` return type
   - Line 133: Internal `Record<string, any>` usage
   - Medium priority

4. **`src/commands/learn.ts`** - Pattern extraction command
   - Line 31: Returns `any[]` instead of `Item[]`
   - Low priority - simple fix

5. **`src/commands/execute-roadmap.ts`** - Roadmap execution
   - Line 79: Uses `(a as any).index` for sorting
   - Low priority - indicates missing type property

6. **`src/schemas.ts`** - Zod schemas for the entire project
   - Line 257: `z.any()` for MCP server configuration
   - Low priority - intentional flexibility

7. **Test files** - Extensive use of `as any` for mocks
   - `src/commands/__tests__/geneticist.test.ts`: Multiple instances
   - Generally acceptable practice for test mocks

## Technical Considerations

### Dependencies
- **Zod**: Used for runtime validation and schema definitions
- **TypeScript**: Need to leverage advanced types (type guards, unknown, branded types)
- **Existing types**: Many proper types already defined in `schemas.ts`

### Patterns to Follow

1. **Use `unknown` instead of `any` for:**
   - Function parameters that could be anything
   - Error handling
   - External API responses

2. **Use proper type guards:**
   - When narrowing types from `unknown`
   - When validating external data

3. **Define interfaces for external APIs:**
   - Sprite CLI responses
   - MCP server configurations
   - Tool call arguments

4. **Leverage Zod for runtime validation:**
   - Convert Zod schemas to TypeScript types
   - Use `.parse()` to validate data before using it

### Existing Type Safety Patterns

The codebase already has good type safety practices:
- Comprehensive Zod schemas in `src/schemas.ts`
- Proper type exports from schemas
- Union types for agent configurations
- Discriminated unions for type-safe dispatch

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes to external API handling | High | Add runtime validation with Zod before removing `any` |
| Type assertions hiding real errors | Medium | Replace `as any` with proper type guards |
| Test failures from stricter typing | Low | Update test mocks to use proper interfaces |
| Sprite CLI API changes breaking types | Medium | Document the API shape and add validation |
| Performance impact from type guards | Low | Type guards have negligible runtime cost |

## Recommended Approach

### Phase 1: High-Priority Fixes (sprite-core.ts)

1. **Define proper types for Sprite API responses:**
   ```typescript
   interface SpriteApiResponse {
     sprites?: SpriteInfo[];
     [key: string]: unknown;
   }

   interface SpriteInfo {
     id: string;
     name: string;
     state?: string;
     status?: string;
     [key: string]: unknown;
   }
   ```

2. **Update normalizeSprites function:**
   - Change parameter type from `any` to `unknown`
   - Add type guards to validate input structure
   - Return properly typed array

3. **Add Zod schema for Sprite responses:**
   - Allows runtime validation
   - Provides both type safety and runtime safety

### Phase 2: Medium-Priority Fixes (prompts.ts, sprite-runner.ts)

1. **Update prompt template rendering:**
   - Replace `(variables as any)` with `Record<string, unknown>`
   - Add proper type guards for variable access

2. **Improve error handling:**
   - Change `error: any` to `error: unknown`
   - Use proper type narrowing

3. **Fix tool call parsing:**
   - Define proper interface for tool calls
   - Use `Record<string, unknown>` for args

### Phase 3: Low-Priority Fixes (other files)

1. **Fix return types in commands:**
   - Change `any[]` to `Item[]` in learn.ts
   - Add missing `index` property to roadmap types

2. **Improve MCP server types:**
   - Replace `z.any()` with `z.record(z.string(), z.unknown())`
   - Document expected MCP server structure

### Phase 4: Documentation and Guidelines

1. **Create type safety guidelines:**
   - When to use `unknown` vs `any`
   - How to write proper type guards
   - How to handle external APIs

2. **Add ESLint rules:**
   - `@typescript-eslint/no-explicit-any` (with warnings)
   - `@typescript-eslint/no-unsafe-assignment`
   - `@typescript-eslint/explicit-function-return-type`

## Open Questions

1. **Sprite CLI API stability:**
   - How often does the Sprite CLI API change?
   - Should we add version detection/handling?
   - Is there official documentation for the API response format?

2. **MCP server configuration:**
   - Are there any constraints on MCP server config structure?
   - Could we define a more specific schema?
   - Should we validate MCP configs at startup?

3. **Priority ordering:**
   - Is sprite-core.ts the highest priority as indicated?
   - Are there other files not mentioned that need attention?
   - Should we focus on hot paths vs. code coverage?

4. **Migration strategy:**
   - Should this be done in one large PR or multiple small PRs?
   - How do we ensure no regressions?
   - Should we add integration tests for the fixed code?

## Conclusion

The task is significantly smaller than initially estimated (15-20 instances vs. claimed 200+). Most `any` usages are in test files (acceptable) or in specific areas handling external data (legitimate). The improvements can be made incrementally without major refactoring, focusing on:

1. Replacing `any` with `unknown` + type guards
2. Defining proper interfaces for external APIs
3. Using Zod for runtime validation
4. Improving return types and function signatures

The highest priority fix is `sprite-core.ts:normalizeSprites()`, which handles external Sprite CLI responses. Other fixes are lower impact and can be done incrementally.
