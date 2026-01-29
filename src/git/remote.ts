import { spawn } from "node:child_process";

/**
 * Parse git remote URL to extract repository slug (owner/repo).
 * Supports both HTTPS and SSH URLs.
 *
 * @param root - Repository root directory
 * @returns Repository slug (e.g., "owner/repo") or null if not a github.com repo
 *
 * @example
 * ```typescript
 * const slug = await getRepoSlug("/path/to/repo");
 * // => "mikehostetler/wreckit"
 *
 * const slug = await getRepoSlug("/path/to/non-github-repo");
 * // => null
 * ```
 */
export async function getRepoSlug(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    const git = spawn("git", ["remote", "get-url", "origin"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    git.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    git.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    git.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve(null);
        return;
      }

      const url = stdout.trim();
      // Match HTTPS: https://github.com/owner/repo.git
      // Match SSH: git@github.com:owner/repo.git
      const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);

      if (match) {
        resolve(match[1]);
      } else {
        resolve(null);
      }
    });

    git.on("error", () => {
      resolve(null);
    });
  });
}
