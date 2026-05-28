import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { BragfastOAuthProvider } from "../src/oauth/provider.js";

const baseClient = {
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  client_name: "Claude",
  token_endpoint_auth_method: "none" as const,
};

describe("BragfastOAuthProvider client registration", () => {
  it("succeeds when the clients file cannot be persisted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bragfast-oauth-blocked-"));
    const blockedParent = join(dir, "not-a-directory");
    await writeFile(blockedParent, "file");

    const provider = new BragfastOAuthProvider({
      clientsFile: join(blockedParent, "clients.json"),
      baseApiUrl: "https://brag.fast/api/v1",
    });

    const client = await provider.clientsStore.registerClient({
      ...baseClient,
      client_id: "claude-test-client",
      client_id_issued_at: 1_700_000_000,
    });

    expect(client.client_id).toBe("claude-test-client");
    expect(
      await provider.clientsStore.getClient("claude-test-client")
    ).toEqual(client);
  });

  it("persists registered clients when the path is writable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bragfast-oauth-writable-"));
    const clientsFile = join(dir, "clients.json");

    const provider = new BragfastOAuthProvider({
      clientsFile,
      baseApiUrl: "https://brag.fast/api/v1",
    });

    await provider.clientsStore.registerClient({
      ...baseClient,
      client_id: "persist-me",
      client_id_issued_at: 1_700_000_000,
    });

    const reloaded = new BragfastOAuthProvider({
      clientsFile,
      baseApiUrl: "https://brag.fast/api/v1",
    });

    expect(await reloaded.clientsStore.getClient("persist-me")).toMatchObject({
      client_id: "persist-me",
      client_name: "Claude",
    });
  });
});
