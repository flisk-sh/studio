# Local Studio

Resize, compress and watermark photos and PDFs in your browser. Your files never leave your computer.

**Use it: [studio.flisk.si](https://studio.flisk.si/)**

## What it does

| Task | What you get |
|------|--------------|
| Photos | Resize to a size you choose, crop square, compress, add a text mark, download a ZIP. Save as JPEG (smaller) or PNG (sharp text). |
| Merge PDFs | Join several PDFs into one file. |
| Shrink PDFs | Make big PDFs small. Pages are re-drawn as images, which also removes hidden text and metadata, so the text can no longer be selected. |
| Watermark PDFs | Put your text across every page. |

After each run you see the result (thumbnails or the PDF itself, with sizes) and download it from there.

## Private by design

There is no server for your files. Everything runs in the page, using your own computer. You can turn off your network after the page has loaded and it still works.

## Free

Free for now, with no limits and no accounts.

## For AI agents

A local MCP server (resize photos, merge and watermark PDFs on your own files) is in [`mcp/`](mcp/).

## Run it yourself

You need [Bun](https://bun.sh).

```bash
bun install
bun run dev      # local preview
bun run build    # builds ./dist
```

The page is a React app using [Astryx](https://github.com/meta/astryx) components, with pdf-lib, pdf.js and JSZip doing the file work. It is served as static files from a Cloudflare Worker (`wrangler.toml`).

## Contributing

Issues and pull requests are welcome. Please keep it local-first: no feature should upload a visitor's files.

## License

MIT
