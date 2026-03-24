import { readFile, writeFile, mkdir, unlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CREDS_DIR = join(homedir(), ".bragfast");
const CREDS_FILENAME = "credentials.json";

// Allow tests to override the credentials directory
let _credsDir = DEFAULT_CREDS_DIR;

export const _testing = {
  setCredsDir(dir: string): void {
    _credsDir = dir;
  },
  resetCredsDir(): void {
    _credsDir = DEFAULT_CREDS_DIR;
  },
};

function getCredsFile(): string {
  return join(_credsDir, CREDS_FILENAME);
}

export interface StoredCredentials {
  api_key: string;
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await readFile(getCredsFile(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "api_key" in parsed &&
      typeof (parsed as Record<string, unknown>).api_key === "string"
    ) {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeCredentials(creds: StoredCredentials): Promise<void> {
  await mkdir(_credsDir, { recursive: true });
  await chmod(_credsDir, 0o700);
  const file = getCredsFile();
  await writeFile(file, JSON.stringify(creds, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export async function deleteCredentials(): Promise<void> {
  try {
    await unlink(getCredsFile());
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw err;
    }
  }
}
