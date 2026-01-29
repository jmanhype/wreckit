import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SpriteSessionStore,
  type SpriteSession,
} from "../../compute/sprites/SpriteSessionStore";

describe("Sprites Backend Integration", () => {
  let tmpDir: string;
  let store: SpriteSessionStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprites-integration-"));
    store = new SpriteSessionStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("Session persistence lifecycle", () => {
    test("completes full save/get/delete cycle", async () => {
      const session: SpriteSession = {
        spriteId: "test-sprite-1",
        repoSlug: "test/repo",
        itemId: "001-test",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "active",
      };

      // Save
      await store.save(session);

      // Get
      const retrieved = await store.get("test/repo", "001-test");
      expect(retrieved).toEqual(session);

      // Delete
      await store.delete("test/repo", "001-test");

      // Verify deleted
      const afterDelete = await store.get("test/repo", "001-test");
      expect(afterDelete).toBeNull();
    });

    test("lists multiple sessions and filters by repo", async () => {
      const session1: SpriteSession = {
        spriteId: "sprite-1",
        repoSlug: "user/repo1",
        itemId: "001",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "active",
      };

      const session2: SpriteSession = {
        spriteId: "sprite-2",
        repoSlug: "user/repo2",
        itemId: "002",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "paused",
      };

      await store.save(session1);
      await store.save(session2);

      const allSessions = await store.list();
      expect(allSessions).toHaveLength(2);

      const repo1Sessions = allSessions.filter((s) => s.repoSlug === "user/repo1");
      expect(repo1Sessions).toHaveLength(1);
      expect(repo1Sessions[0]).toEqual(session1);
    });

    test("updates session status on save", async () => {
      const session: SpriteSession = {
        spriteId: "test-sprite-2",
        repoSlug: "test/repo",
        itemId: "002-test",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "paused",
      };

      await store.save(session);
      const retrieved = await store.get("test/repo", "002-test");
      expect(retrieved?.status).toBe("paused");

      // Update status
      session.status = "active";
      session.lastAccessedAt = new Date().toISOString();
      await store.save(session);

      const updated = await store.get("test/repo", "002-test");
      expect(updated?.status).toBe("active");
    });

    test("touch updates lastAccessedAt timestamp", async () => {
      const session: SpriteSession = {
        spriteId: "test-sprite-3",
        repoSlug: "test/repo",
        itemId: "003-test",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        status: "active",
      };

      await store.save(session);

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.touch("test/repo", "003-test");

      const touched = await store.get("test/repo", "003-test");
      expect(touched?.lastAccessedAt).not.toBe(session.lastAccessedAt);
    });
  });
});
