# Flisk Studio MCP

Photo and PDF tools for your AI agent, running on your own computer. Files are read from and written to your disk by path.
Nothing is uploaded.

| Tool | What it does |
|------|--------------|
| `resize_photos` | Resize, crop square, compress, add a text mark. JPEG or PNG. Originals untouched. |
| `merge_pdfs` | Join PDFs in the order given. |
| `watermark_pdf` | Text across every page, any language. |
| `pdf_info` | Pages, size, title. |

New files never overwrite old ones unless you pass `overwrite: true`; a number is added to the name instead.
For photos of documents or screenshots use `size` 1600 or more and `format: png`, or the text becomes unreadable.

## Add it

Clone this repo, then in `mcp/` run `bun install` (or `npm install`).

Claude Code:

```bash
claude mcp add flisk-studio -- node /path/to/studio/mcp/server.js
```

Any other MCP client:

```json
{ "mcpServers": { "flisk-studio": { "command": "node", "args": ["/path/to/studio/mcp/server.js"] } } }
```

Shrinking PDFs needs a page renderer and is only in the web app for now: [studio.flisk.si](https://studio.flisk.si/).

## Test

```bash
npm test
```
