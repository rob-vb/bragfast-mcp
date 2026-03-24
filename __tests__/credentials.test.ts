import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
  _testing,
} from "../src/lib/credentials.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "bragfast-test-"));
  _testing.setCredsDir(tempDir);
});

afterEach(async () => {
  _testing.resetCredsDir();
  await rm(tempDir, { recursive: true, force: true });
});

describe("readCredentials", () => {
  it("returns null when file does not exist", async () => {
    const result = await readCredentials();
    expect(result).toBeNull();
  });

  it("returns null when file contains corrupted JSON", async () => {
    await writeFile(join(tempDir, "credentials.json"), "not-valid-json{{{");
    const result = await readCredentials();
    expect(result).toBeNull();
  });

  it("returns null when file contains valid JSON but wrong shape", async () => {
    await writeFile(join(tempDir, "credentials.json"), JSON.stringify({ foo: "bar" }));
    const result = await readCredentials();
    expect(result).toBeNull();
  });

  it("returns stored credentials after write", async () => {
    await writeCredentials({ api_key: "test_key_123" });
    const result = await readCredentials();
    expect(result).toEqual({ api_key: "test_key_123" });
  });
});

describe("writeCredentials", () => {
  it("creates directory and file with correct content", async () => {
    const subDir = join(tempDir, "new-subdir");
    _testing.setCredsDir(subDir);

    await writeCredentials({ api_key: "bfk_abc123" });

    const result = await readCredentials();
    expect(result).toEqual({ api_key: "bfk_abc123" });
  });

  it("sets file permissions to 600", async () => {
    await writeCredentials({ api_key: "bfk_abc123" });
    const fileStat = await stat(join(tempDir, "credentials.json"));
    // Check owner read/write only (0o600)
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});

describe("deleteCredentials", () => {
  it("removes the credentials file", async () => {
    await writeCredentials({ api_key: "bfk_abc123" });
    await deleteCredentials();
    const result = await readCredentials();
    expect(result).toBeNull();
  });

  it("does not throw when file does not exist", async () => {
    await expect(deleteCredentials()).resolves.toBeUndefined();
  });
});
