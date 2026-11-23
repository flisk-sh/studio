#!/usr/bin/env node
// Flisk Studio, as an MCP server on your own computer (stdio). It works on files by path and writes new files;
// nothing is uploaded and nothing is overwritten unless you say so.
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {resizePhotos, mergePdfs, watermarkPdf, pdfInfo} from './lib.js';

const server = new McpServer({name: 'flisk-studio', version: '0.1.0'});
const ok = (data) => ({content: [{type: 'text', text: JSON.stringify(data, null, 2)}]});
const fail = (e) => ({isError: true, content: [{type: 'text', text: `Failed: ${e && e.message || e}`}]});
const wrap = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } };
const overwrite = z.boolean().default(false).describe('Replace an existing output file. Default false: a number is added to the name instead.');

server.registerTool('resize_photos', {
  description: 'Resize, crop square, compress and optionally watermark photos on this computer. Writes new files into outDir; the originals are untouched. Use size 1600+ and format png for photos of documents or screenshots, or text becomes unreadable.',
  inputSchema: {
    paths: z.array(z.string()).min(1).describe('Photo files (JPEG, PNG, WebP, GIF, TIFF, AVIF).'),
    outDir: z.string().describe('Folder for the results (created if missing).'),
    size: z.number().int().min(50).max(10000).default(1200).describe('Longest side in pixels, or the side of the square. Never enlarges.'),
    square: z.boolean().default(false).describe('Crop to a square from the centre.'),
    format: z.enum(['jpg', 'png']).default('jpg'),
    quality: z.number().int().min(30).max(100).default(82).describe('JPEG quality.'),
    watermark: z.string().default('').describe('Text across the middle. Any language.'),
    overwrite,
  },
}, wrap(resizePhotos));

server.registerTool('merge_pdfs', {
  description: 'Join PDFs into one file, in the order given.',
  inputSchema: {paths: z.array(z.string()).min(2), out: z.string().describe('Output file path, e.g. /Users/me/merged.pdf'), overwrite},
}, wrap(mergePdfs));

server.registerTool('watermark_pdf', {
  description: 'Put text across every page of a PDF. Any language.',
  inputSchema: {path: z.string(), text: z.string().min(1), out: z.string(), overwrite},
}, wrap(watermarkPdf));

server.registerTool('pdf_info', {
  description: 'Page count, size and title of a PDF.',
  inputSchema: {path: z.string()},
}, wrap(pdfInfo));

await server.connect(new StdioServerTransport());
