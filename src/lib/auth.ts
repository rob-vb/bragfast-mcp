import { readCredentials } from "./credentials.js";

export async function resolveApiKey(): Promise<string> {
  const envKey = process.env.BRAGFAST_API_KEY;
  if (envKey) {
    return envKey;
  }

  const stored = await readCredentials();
  if (stored?.api_key) {
    return stored.api_key;
  }

  throw new Error(
    "Not authenticated. Run: npx @bragfast/mcp-server login\nOr set BRAGFAST_API_KEY env var.\nCreate a key at: https://brag.fast/dashboard/account"
  );
}
