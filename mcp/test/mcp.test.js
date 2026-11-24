// Starts the real server over stdio and calls each tool, the way an agent would.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
async function connect() {
  const client = new Client({name: 'test', version: '0'});
  await client.connect(new StdioClientTransport({command: process.execPath, args: [join(here, '..', 'server.js')]}));
  return client;
}
const json = (r) => JSON.parse(r.content[0].text);
const pdf = async (pages) => { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([200, 200]); return d.save(); };

test('lists the four tools', async () => {
  const c = await connect(); const {tools} = await c.listTools(); await c.close();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['merge_pdfs', 'pdf_info', 'resize_photos', 'watermark_pdf']);
});

test('resize: size, orientation, transparent becomes white, names not overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-')); const c = await connect();
  const land = join(dir, 'land.png'), port = join(dir, 'port.png'), tr = join(dir, 'tr.png');
  await sharp({create: {width: 3000, height: 2000, channels: 3, background: '#39c'}}).png().toFile(land);
  await sharp({create: {width: 2000, height: 3000, channels: 3, background: '#c93'}}).png().toFile(port);
  await sharp({create: {width: 300, height: 200, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).png().toFile(tr);
  const out = join(dir, 'out');
  const r = json(await c.callTool({name: 'resize_photos', arguments: {paths: [land, port, tr], outDir: out, size: 1200}}));
  assert.deepEqual(r.map((x) => [x.width, x.height]), [[1200, 800], [800, 1200], [300, 200]]);
  const px = await sharp(r[2].output).raw().toBuffer(); assert.ok(px[0] > 240 && px[1] > 240 && px[2] > 240, 'transparent area is white');
  const again = json(await c.callTool({name: 'resize_photos', arguments: {paths: [land], outDir: out, size: 1200}}));
  assert.match(again[0].output, /land-2\.jpg$/); assert.equal((await readdir(out)).length, 4);
  const sq = json(await c.callTool({name: 'resize_photos', arguments: {paths: [land], outDir: out, size: 500, square: true, watermark: 'Конфіденційно', format: 'png'}}));
  assert.deepEqual([sq[0].width, sq[0].height], [500, 500]); await c.close();
});

test('resize: overwrite replaces an output without touching any batch input', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const c = await connect();
  t.after(() => c.close());
  const photo = join(dir, 'photo.png'), other = join(dir, 'photo-2.png');
  const output = join(dir, 'photo-4.png');
  const original = await sharp({create: {width: 100, height: 80, channels: 3, background: '#39c'}}).png().toBuffer();
  await writeFile(photo, original);
  await writeFile(other, original);
  await symlink(other, join(dir, 'photo-3.png'));
  await writeFile(output, 'old output');

  const result = await c.callTool({name: 'resize_photos', arguments: {
    paths: [photo, other], outDir: dir, size: 50, format: 'png', overwrite: true,
  }});
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.deepEqual(await readFile(photo), original, 'the original photo must not be overwritten');
  assert.deepEqual(await readFile(other), original, 'other inputs in the batch must not be overwritten');
  const resized = json(result);
  assert.equal(resized[0].output, output);
  assert.equal((await sharp(output).metadata()).width, 50);
});

test('merge, info, watermark', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-')); const c = await connect();
  await writeFile(join(dir, 'a.pdf'), await pdf(2)); await writeFile(join(dir, 'b.pdf'), await pdf(3));
  const m = json(await c.callTool({name: 'merge_pdfs', arguments: {paths: [join(dir, 'a.pdf'), join(dir, 'b.pdf')], out: join(dir, 'm.pdf')}}));
  assert.equal(m.pages, 5);
  assert.equal(json(await c.callTool({name: 'pdf_info', arguments: {path: m.output}})).pages, 5);
  const w = json(await c.callTool({name: 'watermark_pdf', arguments: {path: m.output, text: 'Конфіденційно', out: join(dir, 'w.pdf')}}));
  assert.equal(w.pages, 5); assert.ok((await readFile(w.output)).length > (await readFile(m.output)).length); await c.close();
});

test('resize: fits a long watermark onto a small photo', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const c = await connect();
  t.after(() => c.close());
  const input = join(dir, 'small.png');
  await sharp({create: {width: 96, height: 32, channels: 3, background: '#fff'}}).png().toFile(input);
  const r = await c.callTool({name: 'resize_photos', arguments: {
    paths: [input], outDir: join(dir, 'out'), format: 'png', watermark: 'Internal review copy only',
  }});
  assert.notEqual(r.isError, true, JSON.stringify(r.content));
  const [{output, width, height}] = json(r);
  assert.deepEqual([width, height], [96, 32]);
  const pixels = await sharp(output).removeAlpha().raw().toBuffer();
  assert.ok(pixels.some((channel) => channel < 255), 'the watermark changed the white image');
});

test('a bad file gives an error result, not a crash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-')); const c = await connect(); await writeFile(join(dir, 'x.pdf'), 'hello');
  const r = await c.callTool({name: 'pdf_info', arguments: {path: join(dir, 'x.pdf')}}); assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Failed/); await c.close();
});
