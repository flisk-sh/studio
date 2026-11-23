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

// Shrink in halves, then the last step with high-quality smoothing: one big jump makes text jagged and unreadable.
function resample(src, sx, sy, sw, sh, w, h) {
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / 2 > w && ch / 2 > h) {
    const t = document.createElement('canvas'); t.width = Math.ceil(cw / 2); t.height = Math.ceil(ch / 2);
    const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, cx, cy, cw, ch, 0, 0, t.width, t.height);
    cur = t; cx = 0; cy = 0; cw = t.width; ch = t.height;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h);
  return c;
}

export async function photoBatch(files, o, say) {
  const zip = new JSZip(); const items = []; let before = 0, after = 0, i = 0;
  for (const f of files) {
    say(`Photo ${++i} of ${files.length}…`);
    const bmp = await createImageBitmap(f);
    let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0, w, h;
    if (o.square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; w = h = Math.min(o.size, s); }
    else { const k = Math.min(1, o.size / Math.max(sw, sh)); w = Math.round(sw * k); h = Math.round(sh * k); }
    const c = resample(bmp, sx, sy, sw, sh, w, h); bmp.close();
    const g = c.getContext('2d');
    stamp(g, w, h, o.mark, o.unlocked);
    const png = o.format === 'png';
    const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', o.quality / 100));
    before += f.size; after += blob.size;
    const nm = f.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
    zip.file(nm, blob); items.push({name: nm, kind: 'image', dims: w + ' × ' + h, url: URL.createObjectURL(blob), before: f.size, after: blob.size});
  }
  return {blob: await zip.generateAsync({type: 'blob'}), name: 'photos.zip', items, msg: `Done. ${files.length} photo(s), ${kb(before)} → ${kb(after)}.`};
}

async function watermarkDoc(doc, text, unlocked) {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const p of doc.getPages()) {
    const {width, height} = p.getSize();
    if (text) p.drawText(text, {x: width * 0.15, y: height * 0.35, size: Math.max(24, width / 10), font, color: rgb(0.5, 0.5, 0.5), opacity: 0.25, rotate: degrees(35)});
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
  const zip = new JSZip(); const outs = []; const items = []; let before = 0, after = 0, i = 0;
  for (const f of files) {
    say(`PDF ${++i} of ${files.length}…`); before += f.size;
    let out;
    if (o.action === 'mark') out = await PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true});
    else {
      // Shrink: render each page to JPEG and rebuild. This strips hidden text and metadata; text is no longer selectable.
      const src = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
      out = await PDFDocument.create();
      for (let n = 1; n <= src.numPages; n++) {
        say(`PDF ${i} of ${files.length}: page ${n} of ${src.numPages}…`);
        const pg = await src.getPage(n), vp = pg.getViewport({scale: 2});
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
        const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', o.quality / 100));
        const img = await out.embedJpg(await jpg.arrayBuffer());
        const base = pg.getViewport({scale: 1}); const p = out.addPage([base.width, base.height]);
        p.drawImage(img, {x: 0, y: 0, width: base.width, height: base.height});
        c.width = c.height = 0;
      }
      await src.destroy();
    }
    await watermarkDoc(out, o.mark, o.unlocked);
    const b = await pdfBlob(out); after += b.size; outs.push([f.name, b]); items.push({name: f.name, kind: 'pdf', url: URL.createObjectURL(b), before: f.size, after: b.size});
  }
  const msg = `Done. ${kb(before)} → ${kb(after)}.`;
  if (outs.length === 1) return {blob: outs[0][1], name: outs[0][0], items, msg};
  outs.forEach(([n, b]) => zip.file(n, b));
  return {blob: await zip.generateAsync({type: 'blob'}), name: 'pdfs.zip', items, msg};
}
