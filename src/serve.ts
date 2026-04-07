#!/usr/bin/env node
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { IncomingMessage } from "http";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { BragfastOAuthProvider } from "./oauth/provider.js";
import { BragfastApiClient } from "./lib/api-client.js";
import { createBragfastServer } from "./server.js";
import { renderLoginPage } from "./oauth/login-page.js";

const PORT = Number(process.env.PORT ?? 3000);
const BRAGFAST_API_URL =
  process.env.BRAGFAST_API_URL ?? "https://brag.fast/api/v1";
const OAUTH_CLIENTS_FILE =
  process.env.OAUTH_CLIENTS_FILE ?? "./data/clients.json";
const BASE_URL =
  process.env.BASE_URL ?? `http://localhost:${PORT}`;

const provider = new BragfastOAuthProvider({
  clientsFile: OAUTH_CLIENTS_FILE,
  baseApiUrl: BRAGFAST_API_URL,
});

const app = express();
app.set("trust proxy", 1); // Cloudflare / reverse proxy

// Global CORS — must be before all routes so OAuth endpoints are covered
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// OAuth 2.1 endpoints: /.well-known/oauth-authorization-server, /authorize, /token, /register, /revoke
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(BASE_URL),
    serviceDocumentationUrl: new URL("https://brag.fast/docs/mcp"),
    resourceName: "Bragfast MCP Server",
  })
);

// API key form submission
app.post("/oauth/submit", async (req: Request, res: Response) => {
  const { api_key, code_challenge, redirect_uri, state, client_id } = req.body as Record<string, string>;

  try {
    const code = await provider.submitApiKey(api_key, code_challenge, client_id);
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    // Re-render the form with an error message
    const html = renderLoginPage({
      clientId: client_id ?? "",
      state,
      codeChallenge: code_challenge ?? "",
      redirectUri: redirect_uri ?? "",
      error: (err as Error).message,
    });
    res.status(400).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
  }
});

// CORS headers for the MCP endpoint
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

app.options("/mcp", (_req: Request, res: Response) => {
  res.set(CORS_HEADERS).status(204).end();
});

// OAuth protected resource metadata — tells clients where to authenticate
app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
});

// Auth middleware for /mcp — verifies the Bearer token
app.use("/mcp", async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer realm="${BASE_URL}", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`)
      .json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const authInfo = await provider.verifyAccessToken(token);
    (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    next();
  } catch {
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer realm="${BASE_URL}", error="invalid_token"`)
      .json({ error: "Invalid or expired token" });
  }
});

// MCP transport handler
app.all("/mcp", async (req: Request, res: Response) => {
  res.set(CORS_HEADERS);
  const authInfo = (req as IncomingMessage & { auth?: AuthInfo }).auth;
  const apiKey = authInfo?.token;
  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiClient = BragfastApiClient.withToken(apiKey, BRAGFAST_API_URL);
  const mcpServer = createBragfastServer({ apiClient, mode: "http" });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  await mcpServer.connect(transport);
  await transport.handleRequest(
    req as unknown as IncomingMessage & { auth?: AuthInfo },
    res as unknown as import("http").ServerResponse,
    req.body
  );
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "bragfast-mcp" });
});

app.listen(PORT, () => {
  console.log(`Bragfast MCP Server listening on port ${PORT}`);
  console.log(`MCP endpoint: ${BASE_URL}/mcp`);
  console.log(`OAuth metadata: ${BASE_URL}/.well-known/oauth-authorization-server`);
});
