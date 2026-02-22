# Implementation Phase

## Task

Implement the user stories for this item.

## Item Details

- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Branch:** {{branch_name}}
- **Base Branch:** {{base_branch}}

{{#if scope_limits}}
## Scope Limits
{{scope_limits}}
{{/if}}

## Research

{{research}}

## Implementation Plan

{{plan}}

## User Stories (PRD)

{{prd}}

## Progress Log

{{progress}}

## Instructions

1. Pick the highest priority pending story from the PRD
2. Implement the story following the plan
3. Ensure all acceptance criteria are met
4. Run relevant tests and quality checks
5. Commit changes with a descriptive message
6. Call the `update_story_status` tool with the story ID and status "done"
7. Append learnings/notes to {{item_path}}/progress.log
8. Repeat for remaining stories

## Quality Rules (CRITICAL)

- **No stubs:** Every function must contain real logic. `return true`, `return []`, `// TODO`, or empty implementations are NEVER acceptable. If a function is too complex, break it into smaller real functions.
- **No gaming tests:** Tests must exercise real behavior with real inputs and verify real outputs. A test that validates a stub (`expect(stub()).toBe(true)`) is worse than no test.
- **Build must pass:** Run `bun run typecheck` (or equivalent) before marking stories as done.
- **Tests must pass:** Run `bun test` (or equivalent) before marking stories as done.
- **Verify end-to-end:** After all stories are done, verify the feature works with a real invocation — not just that tests pass.

## Consistency Rules (CRITICAL)

- **No duplicate infrastructure:** Before creating any database client, schema file, type definition, or config file, search the ENTIRE codebase for existing ones (`Glob` for `**/supabase*`, `**/schema*`, `**/database*`, etc.). REUSE what exists. NEVER create a second file serving the same purpose.
- **Enum/type alignment:** When writing values that must match across files (database CHECK constraints, TypeScript union types, status strings), read the existing definitions FIRST and use the EXACT same values. After writing, grep for all usages and verify consistency.
- **Single source of truth:** If you need to modify a shared definition (schema, types, enums), update it in ONE place and then update ALL consumers. Do not modify the definition in one file while leaving stale copies in others.
- **Import from canonical paths:** If the research identified existing modules (e.g., a Supabase client at `src/lib/supabase.ts`), import from that path. Do not create wrapper files at other paths.

## Security Rules (CRITICAL)

- **No shell injection:** NEVER interpolate variables into shell commands, heredocs, or template strings passed to `exec`/`spawn`/`execCommand`. Use base64 encoding, JSON file writes, or argument arrays instead.
- **No plaintext secrets in code:** API keys, tokens, and credentials go in environment variables, never in source files.
- **Sanitize user input:** Any value from user input, form data, or API requests must be validated/escaped before use in SQL, shell commands, URLs, or HTML.

## Working Directory

{{item_path}}

## Completion

When ALL stories have status "done", output the following signal:
{{completion_signal}}
