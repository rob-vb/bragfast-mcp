import { randomBytes } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { Response } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { renderLoginPage } from "./login-page.js";

interface StoredAuthCode {
  apiKey: string;
  codeChallenge: string;
  clientId: string;
  expiresAt: number;
}

interface CachedToken {
  clientId: string;
  expiresAt: number;
}

class BragfastClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();
  private filePath: string;
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const data = await readFile(this.filePath, "utf-8");
      const clients = JSON.parse(data) as OAuthClientInformationFull[];
      for (const client of clients) {
        this.clients.set(client.client_id, client);
      }
    } catch {
      // File doesn't exist yet — start fresh
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify([...this.clients.values()], null, 2)
    );
  }

  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    await this.ensureLoaded();
    return this.clients.get(clientId);
  }

  async registerClient(
    metadata: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    await this.ensureLoaded();
    const client: OAuthClientInformationFull = {
      ...metadata,
      client_id: randomBytes(16).toString("hex"),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(client.client_id, client);
    await this.persist();
    return client;
  }
}

export class BragfastOAuthProvider implements OAuthServerProvider {
  private authCodes = new Map<string, StoredAuthCode>();
  private tokenCache = new Map<string, CachedToken>();
  private tokenClientMap = new Map<string, string>(); // token → clientId
  private _clientsStore: BragfastClientsStore;
  private baseApiUrl: string;

  constructor({
    clientsFile,
    baseApiUrl,
  }: {
    clientsFile: string;
    baseApiUrl: string;
  }) {
    this._clientsStore = new BragfastClientsStore(clientsFile);
    this.baseApiUrl = baseApiUrl;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const html = renderLoginPage({
      clientId: client.client_id,
      state: params.state,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) throw new Error("Invalid authorization code");
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) throw new Error("Invalid or expired authorization code");
    if (Date.now() > stored.expiresAt) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }
    this.authCodes.delete(authorizationCode);
    this.tokenClientMap.set(stored.apiKey, client.client_id);
    return {
      access_token: stored.apiKey,
      token_type: "bearer",
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    // API keys don't expire — treat the refresh token as the key and re-verify
    await this.verifyAccessToken(refreshToken);
    return {
      access_token: refreshToken,
      token_type: "bearer",
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return { token, clientId: cached.clientId, scopes: ["mcp"] };
    }

    const res = await fetch(`${this.baseApiUrl}/account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error("Invalid or revoked API key");
    }

    const clientId = this.tokenClientMap.get(token) ?? "bragfast-mcp";
    // Cache for 5 minutes
    this.tokenCache.set(token, {
      clientId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return { token, clientId, scopes: ["mcp"] };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    this.tokenCache.delete(request.token);
    this.tokenClientMap.delete(request.token);
  }

  // Called from POST /oauth/submit in serve.ts
  async submitApiKey(
    apiKey: string,
    codeChallenge: string,
    clientId: string
  ): Promise<string> {
    const res = await fetch(`${this.baseApiUrl}/account`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error("Invalid API key. Please check and try again.");
    }
    const code = randomBytes(32).toString("hex");
    this.authCodes.set(code, {
      apiKey,
      codeChallenge,
      clientId,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });
    return code;
  }
}
