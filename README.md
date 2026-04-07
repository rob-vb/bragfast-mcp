# @bragfast/mcp-server

MCP server for [Bragfast](https://brag.fast) — generate branded release announcement images and videos from Claude.

## Quick Start

### Claude Desktop / Claude.ai / Cowork

1. Open the app and go to **Settings → Connectors → Add Custom Connector**
2. Paste this URL:

```
https://mcp.brag.fast/mcp
```

3. Sign in with your Bragfast API key when prompted.

### Claude Code

```bash
claude mcp add bragfast --transport http https://mcp.brag.fast/mcp
```

---

## Alternative: Local Installation

If you prefer to run the MCP server locally (required for `bragfast_upload_image` with local file paths):

### Claude Code

```bash
claude mcp add bragfast -- npx -y @bragfast/mcp-server@latest
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bragfast": {
      "command": "npx",
      "args": ["-y", "@bragfast/mcp-server@latest"],
      "env": {
        "BRAGFAST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Authentication (local mode)

Get an API key at [brag.fast/dashboard/account](https://brag.fast/dashboard/account), then run:

```bash
npx @bragfast/mcp-server login <your-api-key>
```

Or set the `BRAGFAST_API_KEY` environment variable.

---

## Tools

| Tool | Description |
|------|-------------|
| `bragfast_generate_release_images` | Generate branded release images. Returns a `cook_id` to poll. |
| `bragfast_generate_release_video` | Generate a branded release video. Returns a `cook_id` to poll. |
| `bragfast_list_brands` | List your brands (colors, logos, fonts). |
| `bragfast_list_templates` | List available templates. |
| `bragfast_get_template` | Get full template config with object IDs. |
| `bragfast_check_account` | Check credits remaining and plan. |
| `bragfast_upload_image` | Upload an image for use in slides. Returns a hosted URL. In remote mode, accepts base64-encoded image data (e.g. a pasted screenshot). In local mode, accepts a file path. |
| `bragfast_get_render_status` | Poll a `cook_id` for completion. Returns image/video URLs when done. |

## Example

```
You: Generate release images for my app v2.3.0 with the new dashboard feature

Claude: [calls bragfast_list_brands → picks your brand]
        [calls bragfast_list_templates → picks standard-browser]
        [calls bragfast_generate_release_images → gets cook_id]
        [calls bragfast_get_render_status → returns image URLs]

Here are your release images:
- Landscape: https://brag.fast/...
- Square: https://brag.fast/...
```

## Self-Hosting

To run the HTTP server on your own infrastructure:

```bash
git clone https://github.com/rob-vb/bragfast-mcp.git
cd bragfast-mcp
npm ci
npm run build
cp .env.example .env
# Edit .env with your BASE_URL, etc.
npm run serve
```

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
| `BASE_URL` | `http://localhost:3000` | Public URL (used in OAuth metadata) |
| `BRAGFAST_API_URL` | `https://brag.fast/api/v1` | Bragfast API base URL |
| `OAUTH_CLIENTS_FILE` | `./data/clients.json` | Path to persist OAuth clients |

Use nginx or Caddy as a reverse proxy for HTTPS. Manage the process with `pm2` or `systemd`.

## Development

```bash
git clone https://github.com/rob-vb/bragfast-mcp.git
cd bragfast-mcp
npm install
npm test        # 37 tests
npm run build   # compile to dist/
```

## License

MIT
