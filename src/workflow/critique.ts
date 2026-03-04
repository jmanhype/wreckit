import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Item, WorkflowState } from "../schemas";
import type { PhaseResult, WorkflowOptions } from "./itemWorkflow";
import { getAgentConfigUnion, runAgentUnion } from "../agent/runner";
import { loadPromptTemplate, renderPrompt } from "../prompts";
import {
  getItemDir,
  getProgressLogPath,
  getPlanPath,
  getPrdPath,
  getResearchPath,
} from "../fs/paths";
import { readItem, writeItem } from "../fs/json";
import { getGitStatus, type GitFileChange, commitAll, hasUncommittedChanges } from "../git";

type CritiqueEvidenceKind = "file" | "test" | "command";

interface CritiqueEvidence {
  kind: CritiqueEvidenceKind;
  path?: string;
  line?: number;
  snippet?: string;
  command?: string;
  output?: string;
}

interface CritiqueResult {
  status: "approved" | "rejected";
  reason: string;
  critique: string;
  evidence: CritiqueEvidence[];
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".swift",
  ".rb",
]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".wreckit",
  "dist",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
]);

function normalizeEvidence(raw: unknown): CritiqueEvidence[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const output: CritiqueEvidence[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const kindRaw = String((row as Record<string, unknown>).kind ?? "").trim();
    if (
      kindRaw !== "file" &&
      kindRaw !== "test" &&
      kindRaw !== "command"
    ) {
      continue;
    }
    const obj = row as Record<string, unknown>;
    const pathRaw = String(obj.path ?? "").trim();
    const snippetRaw = String(obj.snippet ?? "").trim();
    const commandRaw = String(obj.command ?? "").trim();
    const outputRaw = String(obj.output ?? "").trim();
    const lineRaw = obj.line;
    let line: number | undefined;
    if (typeof lineRaw === "number" && Number.isFinite(lineRaw)) {
      line = Math.trunc(lineRaw);
    } else if (typeof lineRaw === "string" && /^\d+$/.test(lineRaw)) {
      line = Number(lineRaw);
    }
    output.push({
      kind: kindRaw,
      path: pathRaw || undefined,
      line,
      snippet: snippetRaw || undefined,
      command: commandRaw || undefined,
      output: outputRaw || undefined,
    });
  }
  return output;
}

function coerceCritiqueResult(raw: unknown): CritiqueResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const status = String(obj.status ?? "").trim();
  if (status !== "approved" && status !== "rejected") {
    return null;
  }
  return {
    status,
    reason: String(obj.reason ?? "").trim(),
    critique: String(obj.critique ?? "").trim(),
    evidence: normalizeEvidence(obj.evidence),
  };
}

function parseCritiqueJson(output: string, logger: Logger): CritiqueResult | null {
  try {
    // Strategy 0: parse entire output as JSON first
    const trimmed = output.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        const coerced = coerceCritiqueResult(parsed);
        if (coerced) {
          return coerced;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.debug(`Failed to parse full critique JSON: ${errorMsg}`);
      }
    }

    // Strategy 1: Look for JSON markdown block
    const codeBlockMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        const coerced = coerceCritiqueResult(parsed);
        if (coerced) {
          return coerced;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.debug(
          `Failed to parse JSON code block in critique: ${errorMsg}`,
        );
      }
    }

    // Strategy 2: Find the last valid JSON object in the output (in case of multiple or trailing text)
    const matches = output.match(/\{[\s\S]*?\}/g);
    if (matches) {
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(matches[i]);
          const coerced = coerceCritiqueResult(parsed);
          if (coerced) {
            return coerced;
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.debug(
            `Failed to parse JSON object ${i}/${matches.length} in critique: ${errorMsg}`,
          );
          continue;
        }
      }
    }
    return null;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.debug(`Critique JSON parsing entirely failed: ${errorMsg}`);
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveEvidencePath(root: string, value: string): string {
  const candidate = value.trim();
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.join(root, candidate);
}

async function validateRejectedEvidence(
  critique: CritiqueResult,
  root: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  const evidence = critique.evidence;
  if (evidence.length === 0) {
    return {
      valid: false,
      issues: ["missing evidence[] for rejected critique"],
    };
  }

  let validEntries = 0;
  for (let i = 0; i < evidence.length; i++) {
    const row = evidence[i];
    const label = `evidence[${i}]`;
    if (row.kind === "file") {
      if (!row.path) {
        issues.push(`${label} missing path`);
        continue;
      }
      const absPath = resolveEvidencePath(root, row.path);
      if (!(await pathExists(absPath))) {
        issues.push(`${label} path does not exist: ${row.path}`);
        continue;
      }
      const stats = await fs.stat(absPath).catch(() => null);
      if (!stats?.isFile()) {
        issues.push(`${label} path is not a file: ${row.path}`);
        continue;
      }
      if (typeof row.line === "number" && row.line <= 0) {
        issues.push(`${label} invalid line: ${row.line}`);
        continue;
      }
      if (row.snippet) {
        const content = await fs.readFile(absPath, "utf-8").catch(() => "");
        if (!content.includes(row.snippet)) {
          issues.push(`${label} snippet not found in ${row.path}`);
          continue;
        }
      }
      validEntries += 1;
      continue;
    }

    if (!row.command || !row.output) {
      issues.push(`${label} ${row.kind} requires command and output`);
      continue;
    }
    validEntries += 1;
  }

  if (validEntries === 0) {
    issues.push("no verifiable evidence entries");
  }
  return { valid: validEntries > 0, issues };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMissingSymbolClaims(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /`([A-Za-z_][A-Za-z0-9_]*)`[^.\n]{0,120}(?:does not exist|not found|missing|is not defined)/gi,
    /(?:class|function|type|interface|symbol)\s+([A-Za-z_][A-Za-z0-9_]*)[^.\n]{0,120}(?:does not exist|not found|missing|is not defined)/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      out.add(match[1]);
    }
  }
  return Array.from(out);
}

function extractMissingFileClaims(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /`([^`]+(?:\/|\\)[^`]+)`[^.\n]{0,120}(?:does not exist|not found|missing)/gi,
    /(?:No such file or directory|file or directory not found):?\s*([~/./A-Za-z0-9_-][^\s"'`)]*)/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const raw = match[1].trim();
      if (!raw) {
        continue;
      }
      out.add(raw);
    }
  }
  return Array.from(out);
}

async function symbolExistsInRepo(root: string, symbol: string): Promise<boolean> {
  const queue: string[] = [root];
  const word = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  let scannedFiles = 0;
  const maxFiles = 5000;

  while (queue.length > 0 && scannedFiles < maxFiles) {
    const dir = queue.pop()!;
    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = (await fs.readdir(dir, {
        withFileTypes: true,
        encoding: "utf8",
      })) as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryName = entry.name;
      if (entryName.startsWith(".DS_Store")) {
        continue;
      }
      const fullPath = path.join(dir, entryName);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entryName)) {
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!CODE_EXTENSIONS.has(path.extname(entryName).toLowerCase())) {
        continue;
      }
      scannedFiles += 1;
      let content = "";
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > 2 * 1024 * 1024) {
          continue;
        }
        content = await fs.readFile(fullPath, "utf-8");
      } catch {
        continue;
      }
      if (word.test(content)) {
        return true;
      }
    }
  }
  return false;
}

async function findContradictedMissingSymbols(
  root: string,
  critique: CritiqueResult,
): Promise<string[]> {
  const text = `${critique.reason}\n${critique.critique}`;
  const claimedMissing = extractMissingSymbolClaims(text);
  const missingFiles = extractMissingFileClaims(text);
  const contradicted: string[] = [];
  for (const symbol of claimedMissing.slice(0, 10)) {
    if (await symbolExistsInRepo(root, symbol)) {
      contradicted.push(`symbol:${symbol}`);
    }
  }
  for (const filePathRaw of missingFiles.slice(0, 10)) {
    const resolved = resolveEvidencePath(root, filePathRaw);
    if (await pathExists(resolved)) {
      contradicted.push(`path:${filePathRaw}`);
    }
  }
  return contradicted;
}

export async function runPhaseCritique(
  itemId: string,
  options: WorkflowOptions,
): Promise<PhaseResult> {
  const {
    root,
    config,
    logger,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
  } = options;

  let item = await readItem(getItemDir(root, itemId));
  const itemDir = getItemDir(root, item.id);

  if (item.state !== "implementing" && item.state !== "critique") {
    // If we are in 'planned', it means we regressed. Allow it to fail gracefully so runCommand can pick up 'implement' next.
    if (item.state === "planned") {
      return { success: true, item };
    }
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'implementing' for critique phase`,
    };
  }

  // If already in critique state, we assume it passed previously or was manually moved
  if (item.state === "critique" && !options.force) {
    return { success: true, item };
  }

  const template = await loadPromptTemplate(root, "critique");

  // Load context for variables
  const plan = await fs
    .readFile(getPlanPath(root, item.id), "utf-8")
    .catch(() => "");
  const prd = await fs
    .readFile(getPrdPath(root, item.id), "utf-8")
    .catch(() => "");

  const variables = {
    id: item.id,
    title: item.title,
    overview: item.overview,
    plan,
    prd,
    section: item.section || "items",
    item_path: itemDir,
    branch_name: item.branch || "unknown",
    base_branch: config.base_branch,
    completion_signal: "JSON_OUTPUT",
    sdk_mode: true,
  };

  const prompt = renderPrompt(template, variables);
  const agentConfig = getAgentConfigUnion(config);

  const result = await runAgentUnion({
    itemId: itemId,
    config: agentConfig,
    cwd: root, // Critic runs at root to see everything
    prompt,
    logger,
    dryRun,
    mockAgent,
    timeoutSeconds: config.timeout_seconds,
    onStdoutChunk: onAgentOutput,
    onStderrChunk: onAgentOutput,
    onAgentEvent,
    allowedTools: [
      "read_file",
      "run_shell_command",
      "glob",
      "search_file_content",
      "list_directory",
    ], // Read-only tools
  });

  if (dryRun) {
    return { success: true, item };
  }

  if (mockAgent) {
    item = { ...item, state: "critique" };
    await writeItem(itemDir, item);
    return { success: true, item };
  }

  // TECHNICAL FAILURE HANDLING (Self-Healing)
  if (!result.success) {
    const error = result.timedOut
      ? "Critic timed out (complexity too high)"
      : `Critic failed: ${result.output.slice(0, 100)}...`;
    logger.warn(
      `Critique technical failure: ${error}. Regressing to 'planned' for simplification.`,
    );

    // Regress to planned to force re-implementation/simplification
    item = { ...item, state: "planned", last_error: error };
    await writeItem(itemDir, item);
    // Return SUCCESS so the loop continues to 'implement' phase instead of crashing
    return { success: true, item };
  }

  const critique = parseCritiqueJson(result.output, logger);

  if (!critique) {
    const error = "Critic failed to output valid JSON decision";
    logger.error(error);
    // Regress to planned on parsing failure too
    item = { ...item, state: "planned", last_error: error };
    await writeItem(itemDir, item);
    return { success: true, item };
  }

  // Log critique
  const progressPath = getProgressLogPath(root, item.id);
  const timestamp = new Date().toISOString();
  const logEntry = `\n[${timestamp}] CRITIQUE (${critique.status.toUpperCase()}):\n${critique.critique}\nReason: ${critique.reason}\n`;
  await fs.appendFile(progressPath, logEntry, "utf-8");

  if (critique.status === "rejected") {
    const contradictedSymbols = await findContradictedMissingSymbols(
      root,
      critique,
    );
    if (contradictedSymbols.length > 0) {
      logger.warn(
        `Critic rejection contradicted by repository symbols (${contradictedSymbols.join(", ")}); auto-approving critique phase`,
      );
      const contradictionLog = `\n[${timestamp}] CRITIQUE (AUTO-APPROVE): Rejection contradicted by repo symbols: ${contradictedSymbols.join(", ")}\n`;
      await fs.appendFile(progressPath, contradictionLog, "utf-8");
      item = { ...item, state: "critique", last_error: null };
      await writeItem(itemDir, item);
      const gitOptions = { cwd: root, logger, dryRun };
      if (await hasUncommittedChanges(gitOptions)) {
        await commitAll(
          `critique(${item.id}): auto-approved contradictory rejection`,
          gitOptions,
        );
      }
      return { success: true, item };
    }

    const evidenceValidation = await validateRejectedEvidence(critique, root);
    if (!evidenceValidation.valid) {
      const issueText = evidenceValidation.issues.join("; ");
      const missingEvidenceReason = `Critique rejected without verifiable evidence: ${issueText}`;
      logger.warn(missingEvidenceReason);
      const invalidEvidenceLog = `\n[${timestamp}] CRITIQUE (INVALID): ${missingEvidenceReason}\n`;
      await fs.appendFile(progressPath, invalidEvidenceLog, "utf-8");
      item = {
        ...item,
        state: "planned",
        last_error: missingEvidenceReason,
      };
      await writeItem(itemDir, item);
      const gitOptions = { cwd: root, logger, dryRun };
      if (await hasUncommittedChanges(gitOptions)) {
        await commitAll(
          `critique(${item.id}): rejected (invalid evidence)`,
          gitOptions,
        );
      }
      return { success: true, item };
    }

    logger.warn(`Critic REJECTED implementation: ${critique.reason}`);

    // REGRESSION LOOP: Move back to planned
    item = {
      ...item,
      state: "planned",
      last_error: `Critique Failed: ${critique.reason}`,
    };
    await writeItem(itemDir, item);

    // Commit critique metadata (state regression + progress log)
    const gitOptions = { cwd: root, logger, dryRun };
    if (await hasUncommittedChanges(gitOptions)) {
      await commitAll(`critique(${item.id}): rejected — ${critique.reason.slice(0, 60)}`, gitOptions);
    }

    return { success: true, item };
  }

  logger.info("Critic APPROVED implementation");
  item = { ...item, state: "critique", last_error: null };
  await writeItem(itemDir, item);

  // Commit critique metadata (state change + progress log)
  const gitOptions = { cwd: root, logger, dryRun };
  if (await hasUncommittedChanges(gitOptions)) {
    await commitAll(`critique(${item.id}): approved`, gitOptions);
  }

  return { success: true, item };
}
