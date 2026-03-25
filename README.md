# @bragfast/mcp-server

MCP server for [Bragfast](https://bragfast.com) — generate branded release announcement images and videos from Claude.

## Quick Start

### Claude Code

```bash
claude mcp add bragfast -- npx -y @bragfast/mcp-server
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bragfast": {
      "command": "npx",
      "args": ["-y", "@bragfast/mcp-server"],
      "env": {
        "BRAGFAST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Cursor / Windsurf / other MCP clients

Use the same stdio config — `npx -y @bragfast/mcp-server` with `BRAGFAST_API_KEY` set.

## Authentication

Get an API key at [bragfast.com/dashboard/api-keys](https://bragfast.com/dashboard/api-keys).

**Option 1: Environment variable**

```bash
export BRAGFAST_API_KEY=your-api-key
```

**Option 2: Login command**

```bash
npx @bragfast/mcp-server login <your-api-key>
```

Stores the key in `~/.bragfast/credentials.json`.

## Tools

| Tool | Description |
|------|-------------|
| `bragfast_generate_release_images` | Generate branded release images. Returns a `cook_id` to poll. |
| `bragfast_generate_release_video` | Generate a branded release video. Returns a `cook_id` to poll. |
| `bragfast_list_brands` | List your brands (colors, logos, fonts). |
| `bragfast_list_templates` | List available templates with full config and object IDs. |
| `bragfast_check_account` | Check credits remaining and plan. |
| `bragfast_get_render_status` | Poll a `cook_id` for completion. Returns image/video URLs when done. |

## Example

```
You: Generate release images for my app v2.3.0 with the new dashboard feature

Claude: [calls bragfast_list_brands → picks your brand]
        [calls bragfast_list_templates → picks standard-browser]
        [calls bragfast_generate_release_images → gets cook_id]
        [calls bragfast_get_render_status → returns image URLs]

Here are your release images:
- Landscape: https://bragfast.com/...
- Square: https://bragfast.com/...
```

## Development

```bash
git clone https://github.com/rob-vb/bragfast-mcp.git
cd bragfast-mcp
npm install
npm test        # 35 tests
npm run build   # compile to dist/
```

## License

MIT
