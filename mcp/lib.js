// The work behind the MCP tools. Everything runs on this computer; nothing is sent anywhere.
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {basename, extname, join, resolve} from 'node:path';
import sharp from 'sharp';
import {PDFDocument, StandardFonts, rgb, degrees} from 'pdf-lib';

const exists = (p) => access(p).then(() => true, () => false);
const esc = (t) => t.replace(/[<>&"']/g, (c) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]));

// Never overwrite a file unless asked, and never write over an input.
export async function safeOut(dir, name, overwrite) {
  await mkdir(dir, {recursive: true});
  const ext = extname(name), stem = basename(name, ext); let n = join(dir, name), k = 1;
  while (!overwrite && (await exists(n))) n = join(dir, `${stem}-${++k}${ext}`);
  return n;
}

async function textPng(text, px) {
  const w = Math.ceil(text.length * px * 0.7) + 16, h = Math.ceil(px * 1.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="8" y="${px * 1.1}" font-family="sans-serif" font-weight="700" font-size="${px}" fill="#808080">${esc(text)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function resizePhotos({paths, outDir, size = 1200, square = false, format = 'jpg', quality = 82, watermark = '', overwrite = false}) {
  const results = [];
  for (const p of paths) {
    const src = resolve(p); const meta = await sharp(src).metadata();
    let img = sharp(src).rotate(); // honour the camera's orientation
    const [w, h] = meta.orientation && meta.orientation >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
    if (square) { const s = Math.min(w, h, size); img = img.resize(s, s, {fit: 'cover'}); }
    else img = img.resize({width: size, height: size, fit: 'inside', withoutEnlargement: true});
    if (format === 'jpg') img = img.flatten({background: '#ffffff'}); // transparent PNGs become white, not black
    let buf = await img.toBuffer();
    if (watermark) {
      const m = await sharp(buf).metadata(); const mark = await textPng(watermark, Math.max(14, Math.round(m.width / 22)));
      buf = await sharp(buf).composite([{input: mark, gravity: 'centre', blend: 'over'}]).toBuffer();
    }
    const out = await safeOut(resolve(outDir), basename(src, extname(src)) + (format === 'png' ? '.png' : '.jpg'), overwrite);
    const final = format === 'png' ? sharp(buf).png() : sharp(buf).jpeg({quality});
    const info = await final.toFile(out);
    results.push({input: src, output: out, width: info.width, height: info.height, bytes: info.size});
  }
  return results;
}

export async function mergePdfs({paths, out, overwrite = false}) {
  const doc = await PDFDocument.create();
  for (const p of paths) { const d = await PDFDocument.load(await readFile(resolve(p)), {ignoreEncryption: true}); (await doc.copyPages(d, d.getPageIndices())).forEach((pg) => doc.addPage(pg)); }
  const target = await safeOut(resolve(out, '..'), basename(out), overwrite);
  await writeFile(target, await doc.save());
  return {output: target, pages: doc.getPageCount(), inputs: paths.length};
}

export async function watermarkPdf({path, text, out, overwrite = false}) {
  const doc = await PDFDocument.load(await readFile(resolve(path)), {ignoreEncryption: true});
  const png = await doc.embedPng(await textPng(text, 120)); // drawn as an image so any language works
  for (const p of doc.getPages()) {
    const {width, height} = p.getSize(); const w = Math.min(width * 0.8, png.width), k = w / png.width;
    p.drawImage(png, {x: width * 0.12, y: height * 0.3, width: w, height: png.height * k, opacity: 0.25, rotate: degrees(35)});
  }
  const target = await safeOut(resolve(out, '..'), basename(out), overwrite);
  await writeFile(target, await doc.save());
  return {output: target, pages: doc.getPageCount()};
}

export async function pdfInfo({path}) {
  const bytes = await readFile(resolve(path)); const d = await PDFDocument.load(bytes, {ignoreEncryption: true});
  return {path: resolve(path), pages: d.getPageCount(), bytes: bytes.length, title: d.getTitle() || null, author: d.getAuthor() || null};
}
