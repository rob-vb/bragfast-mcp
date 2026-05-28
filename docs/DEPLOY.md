# Deploying `mcp.brag.fast`

The hosted MCP server runs on a VPS via **pm2**, not Vercel. Publishing to npm does **not** update production — you must pull and restart on the server.

## Update production

SSH into the VPS, then:

```bash
cd ~/bragfast-mcp          # or wherever the repo is cloned
git pull origin main
npm ci
npm run build
pm2 restart bragfast-mcp   # run `pm2 list` if the name differs
```

## Verify

```bash
curl -s https://mcp.brag.fast/health
# expect: {"ok":true,"service":"bragfast-mcp","version":"0.3.5"}

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mcp.brag.fast/register \
  -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"client_name":"Claude","grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
# expect: 201
```

If `/register` still returns **500**, check pm2 logs:

```bash
pm2 logs bragfast-mcp --lines 50
```

Look for `[oauth] Could not persist clients` (non-fatal after 0.3.5) or other stack traces.

## Environment

Copy `.env.example` to `.env` on first setup. Important vars:

| Variable | Production value |
|----------|------------------|
| `BASE_URL` | `https://mcp.brag.fast` |
| `BRAGFAST_API_URL` | `https://brag.fast/api/v1` |
| `OAUTH_CLIENTS_FILE` | `/data/clients.json` if you have a persistent volume, else omit (defaults to `/tmp/bragfast-oauth/clients.json`) |
| `NODE_ENV` | `production` |

## First-time pm2 setup

```bash
cd ~/bragfast-mcp
npm ci && npm run build
pm2 start dist/serve.js --name bragfast-mcp
pm2 save
```

Point nginx/Caddy at the process port (default `3000`).
