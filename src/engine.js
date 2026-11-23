// All file work runs in the browser. Nothing is uploaded.
import JSZip from 'jszip';
import {PDFDocument, StandardFonts, rgb, degrees} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
export const MARK = 'flisk studio';
export const FREE_FILES = 5;
export const kb = (n) => (n / 1024).toFixed(0) + ' KB';

// Unlock: set both, then point the Stripe Payment Link's after-payment redirect at /?unlocked=<UNLOCK_TOKEN>.
// Honour-system gate: the token is readable in the bundle. See README.
export const PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_ME';
export const UNLOCK_TOKEN = 'REPLACE_WITH_RANDOM_STRING';
const KEY = 'studio-unlocked';
// Free for now: no file limit and no mark. Set to false to bring back the free tier and the Stripe unlock.
export const FREE_FOR_NOW = true;
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
export function initUnlock() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('unlocked') === UNLOCK_TOKEN) { store.set(KEY, '1'); history.replaceState(null, '', location.pathname); }
  return FREE_FOR_NOW || store.get(KEY) === '1';
}

function stamp(g, w, h, text, unlocked) {
  const fs = Math.max(12, Math.round(w / 28));
  g.textBaseline = 'bottom';
  const draw = (t, x, y, a) => { g.fillStyle = `rgba(255,255,255,${a})`; g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = fs / 12; g.strokeText(t, x, y); g.fillText(t, x, y); };
  if (text) { g.font = `600 ${fs}px sans-serif`; g.textAlign = 'center'; draw(text, w / 2, h / 2 + fs / 2, 0.55); }
  if (!unlocked) { g.font = `600 ${Math.round(fs * 0.6)}px sans-serif`; g.textAlign = 'right'; draw(MARK, w - fs / 2, h - fs / 2, 0.7); }
}

function unique(name, used) {
  let n = name, k = 1; const dot = name.lastIndexOf('.');
  while (used.has(n)) n = name.slice(0, dot) + '-' + (++k) + name.slice(dot);
  used.add(n); return n;
}

// Shrink in halves, then the last step with high-quality smoothing: one big jump makes text jagged and unreadable.
function resample(src, sx, sy, sw, sh, w, h, white) {
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / 2 > w && ch / 2 > h) {
    const t = document.createElement('canvas'); t.width = Math.ceil(cw / 2); t.height = Math.ceil(ch / 2);
    const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, cx, cy, cw, ch, 0, 0, t.width, t.height);
    cur = t; cx = 0; cy = 0; cw = t.width; ch = t.height;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  if (white) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h);
  return c;
}

export async function photoBatch(files, o, say) {
  const zip = new JSZip(); const items = []; const used = new Set(); let before = 0, after = 0, i = 0;
  for (const f of files) {
    say(`Photo ${++i} of ${files.length}…`);
    const bmp = await createImageBitmap(f);
    let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0, w, h;
    if (o.square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; w = h = Math.min(o.size, s); }
    else { const k = Math.min(1, o.size / Math.max(sw, sh)); w = Math.round(sw * k); h = Math.round(sh * k); }
    const c = resample(bmp, sx, sy, sw, sh, w, h, o.format !== 'png'); bmp.close();
    const g = c.getContext('2d');
    stamp(g, w, h, o.mark, o.unlocked);
    const png = o.format === 'png';
    const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', o.quality / 100));
    before += f.size; after += blob.size;
    const nm = unique(f.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg'), used);
    zip.file(nm, blob); items.push({name: nm, kind: 'image', dims: w + ' × ' + h, url: URL.createObjectURL(blob), before: f.size, after: blob.size});
  }
  return {blob: await zip.generateAsync({type: 'blob'}), name: 'photos.zip', items, msg: `Done. ${files.length} photo(s), ${kb(before)} → ${kb(after)}.`};
}

async function textPng(text, px) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = `700 ${px}px sans-serif`; c.width = Math.ceil(g.measureText(text).width) + 8; c.height = Math.ceil(px * 1.4);
  g.font = `700 ${px}px sans-serif`; g.fillStyle = '#808080'; g.textBaseline = 'middle'; g.fillText(text, 4, c.height / 2);
  return new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
}
// The text is drawn as an image, so any language works (the built-in PDF fonts only know Latin).
async function watermarkDoc(doc, text, unlocked) {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = text ? await doc.embedPng(await textPng(text, 120)) : null;
  for (const p of doc.getPages()) {
    const {width, height} = p.getSize();
    if (img) {
      const w = Math.min(width * 0.8, img.width), k = w / img.width, h = img.height * k;
      p.drawImage(img, {x: width * 0.12, y: height * 0.3, width: w, height: h, opacity: 0.25, rotate: degrees(35)});
    }
    if (!unlocked) p.drawText(MARK, {x: width - 90, y: 12, size: 9, font, color: rgb(0.4, 0.4, 0.4), opacity: 0.8});
  }
}
const pdfBlob = async (d) => new Blob([await d.save()], {type: 'application/pdf'});

export async function pdfBatch(files, o, say) {
  if (o.action === 'merge') {
    const out = await PDFDocument.create();
    for (const f of files) {
      const d = await PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true});
      (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p));
    }
    await watermarkDoc(out, o.mark, o.unlocked);
    return {blob: await pdfBlob(out), name: 'merged.pdf', items: [{name: 'merged.pdf', kind: 'pdf', url: URL.createObjectURL(await pdfBlob(out))}], msg: `Merged ${files.length} PDF(s) into ${out.getPageCount()} pages.`};
  }
  const zip = new JSZip(); const outs = []; const items = []; const used = new Set(); let kept = 0; let before = 0, after = 0, i = 0;
  for (const f of files) {
    say(`PDF ${++i} of ${files.length}…`); before += f.size;
    let out, srcPages = 0;
    if (o.action === 'mark') out = await PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true});
    else {
      // Shrink: render each page to JPEG and rebuild. This strips hidden text and metadata; text is no longer selectable.
      const src = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
      out = await PDFDocument.create(); srcPages = src.numPages;
      let rendered = 0;
      for (let n = 1; n <= src.numPages; n++) {
        say(`PDF ${i} of ${files.length}: page ${n} of ${src.numPages}…`);
        // After 3 pages, if the whole file would come out bigger than the original, stop: the original is kept below.
        if (n === 4 && rendered / 3 * src.numPages > f.size) break;
        const pg = await src.getPage(n), vp = pg.getViewport({scale: 2});
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
        const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', o.quality / 100));
        rendered += jpg.size;
        const img = await out.embedJpg(await jpg.arrayBuffer());
        const base = pg.getViewport({scale: 1}); const p = out.addPage([base.width, base.height]);
        p.drawImage(img, {x: 0, y: 0, width: base.width, height: base.height});
        c.width = c.height = 0;
      }
      await src.destroy();
    }
    await watermarkDoc(out, o.mark, o.unlocked);
    let b = await pdfBlob(out);
    if (o.action === 'shrink' && (b.size >= f.size || out.getPageCount() < srcPages)) {
      // Text PDFs are already small; turning pages into pictures would make them bigger. Keep the original.
      const keep = await PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true});
      await watermarkDoc(keep, o.mark, o.unlocked); b = await pdfBlob(keep); kept++;
    }
    const nm = unique(f.name, used);
    after += b.size; outs.push([nm, b]); items.push({name: nm, kind: 'pdf', url: URL.createObjectURL(b), before: f.size, after: b.size});
  }
  const msg = `Done. ${kb(before)} → ${kb(after)}.` + (kept ? ` ${kept} file(s) were already small (text PDFs), so they were left as they were.` : '');
  if (outs.length === 1) return {blob: outs[0][1], name: outs[0][0], items, msg};
  outs.forEach(([n, b]) => zip.file(n, b));
  return {blob: await zip.generateAsync({type: 'blob'}), name: 'pdfs.zip', items, msg};
}
