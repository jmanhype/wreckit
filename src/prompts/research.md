# Research Phase

You are tasked with conducting comprehensive research for the following item. Be thorough, skeptical, and document your findings with specific file references.

## Item Details

- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Working Directory:** {{item_path}}

## Research Process

### Step 1: Initial Analysis

1. **Understand the scope:**
   - Break down the task into composable research areas
   - Identify specific components, patterns, or concepts to investigate
   - Consider which directories, files, or architectural patterns are relevant

2. **Read relevant files:**
   - Read files COMPLETELY - do not skim or read partially
   - Start with files directly related to the feature/task
   - Trace dependencies and connections

### Step 2: Infrastructure Inventory (CRITICAL)

Before investigating the task itself, catalog the project's shared infrastructure. This prevents duplicate files and inconsistent conventions:

1. **Database layer:** Find ALL schema files (*.sql), migration files, and type definitions. Note enum values, column names, and table relationships.
2. **Client libraries:** Find ALL API/database client instantiations (e.g., Supabase, Prisma, Firebase). Note which credentials each uses and which files import them.
3. **Shared types:** Find ALL type definition files for database models, API responses, etc. Note where each is defined and where it's imported.
4. **Config files:** Find ALL environment variable references and configuration patterns.

Document these in the "Key Files" section with exact paths. The implementation agent MUST reuse existing infrastructure — never create duplicates.

### Step 3: Deep Investigation

1. **Explore the codebase:**
   - Find all files related to this task
   - Understand how the current implementation works
   - Identify patterns and conventions to follow
   - Look for similar features we can model after

2. **Document what you find:**
   - Include specific file paths and line numbers
   - Note existing patterns and conventions
   - Identify integration points and dependencies
   - Find relevant tests and examples

### Step 4: Synthesize Findings

Compile your research with:

- Concrete file references (file:line format)
- Patterns, connections, and architectural decisions
- Areas that need special attention
- Potential challenges or risks

## Output

Create a file at: `{{item_path}}/research.md`

**CRITICAL:** You MUST use the EXACT section headers below. Do not paraphrase or omit them. The system validates these headers strictly.

Required Headers:

1. `# Research: {{title}}` (Top-level header)
2. `## Research Question`
3. `## Summary`
4. `## Current State Analysis`
5. `## Key Files`
6. `## Technical Considerations`
7. `## Risks and Mitigations`
8. `## Recommended Approach`
9. `## Open Questions`

Use this structure:

```markdown
# Research: {{title}}

**Date**: [Current date]
**Item**: {{id}}

## Research Question

{{overview}}

## Summary

[High-level findings - 2-3 paragraphs answering what needs to be done and how]

## Current State Analysis

### Existing Implementation

- [What exists now with file:line references]
- [Current patterns and conventions]
- [Integration points]

## Key Files

- `path/to/file.ext:123` - Description of what's there
- `another/file.ts:45-67` - Description of the code block

## Technical Considerations

### Dependencies

- [External dependencies needed]
- [Internal modules to integrate with]

### Patterns to Follow

- [Existing patterns to maintain consistency]
- [Conventions observed in the codebase]

## Risks and Mitigations

| Risk     | Impact            | Mitigation       |
| -------- | ----------------- | ---------------- |
| [Risk 1] | [High/Medium/Low] | [How to address] |

## Recommended Approach

[High-level strategy based on research findings]

## Open Questions

[Any areas that need clarification before implementation]
```

## Important Guidelines

1. **Be Thorough:**
   - Read all relevant files COMPLETELY
   - Don't assume - verify with actual code
   - Include specific file paths and line numbers

2. **Be Skeptical:**
   - Question assumptions
   - Verify patterns actually exist
   - Look for edge cases

3. **Be Practical:**
   - Focus on actionable findings
   - Note what's in scope vs out of scope
   - Consider migration and backwards compatibility

## Completion

When you have completed the research and created the `{{item_path}}/research.md` file, output the following signal:
{{completion_signal}}
