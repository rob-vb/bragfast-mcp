#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BragfastApiClient } from "./lib/api-client.js";
import { createBragfastServer } from "./server.js";

const client = new BragfastApiClient();
const server = createBragfastServer({ apiClient: client });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bragfast MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
