#!/usr/bin/env node
import { writeCredentials, deleteCredentials } from "./lib/credentials.js";

const [command] = process.argv.slice(2);

async function login() {
  // For v1, just print instructions. Browser-based login is v1.1.
  console.log(
    "To authenticate, create an API key at: https://brag.fast/dashboard/account"
  );
  console.log("");
  console.log("Then either:");
  console.log("  1. Set BRAGFAST_API_KEY environment variable");
  console.log("  2. Run: npx @bragfast/mcp-server login <your-api-key>");

  const apiKey = process.argv[3];
  if (apiKey) {
    await writeCredentials({ api_key: apiKey });
    console.log("\nAPI key saved! You can now use bragfast in Claude.");
  }
}

async function logout() {
  await deleteCredentials();
  console.log("Logged out. Stored credentials removed.");
}

async function main() {
  switch (command) {
    case "login":
      await login();
      break;
    case "logout":
      await logout();
      break;
    default:
      // If no command, start MCP server (import dynamically to avoid loading everything for login/logout)
      await import("./index.js");
      break;
  }
}

main().catch((err) => {
  console.error("Error:", (err as Error).message);
  process.exit(1);
});
