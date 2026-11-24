// Pixel work for the Editor tab. Everything runs on canvases in the page; nothing is uploaded.
export const MAX_EDGE = 5000; // very large photos are scaled down on open so undo history stays within memory
export const NEUTRAL = {brightness: 100, contrast: 100, saturation: 100, blur: 0, gray: 0, sepia: 0};
export const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export const copyCanvas = (src) => { const c = makeCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };

export async function loadCanvas(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(bmp.width * k, bmp.height * k);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return {canvas: c, scaled: k < 1, from: [bmp.width, bmp.height]};
}

export function cropCanvas(src, r) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
  const c = makeCanvas(w, h); c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c;
}
export function rotateCanvas(src, dir) { // dir: 1 = clockwise, -1 = counter-clockwise
  const c = makeCanvas(src.height, src.width), g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2); g.rotate(dir * Math.PI / 2); g.drawImage(src, -src.width / 2, -src.height / 2); return c;
}
export function flipCanvas(src, axis) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  if (axis === 'h') { g.translate(c.width, 0); g.scale(-1, 1); } else { g.translate(0, c.height); g.scale(1, -1); }
  g.drawImage(src, 0, 0); return c;
}
export function resizeCanvas(src, w, h) {
  let cur = src; w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  // Halve step by step when shrinking a lot: one big jump looks jagged.
  while (cur.width / 2 > w && cur.height / 2 > h) { const half = makeCanvas(cur.width / 2, cur.height / 2); const g = half.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, half.width, half.height); cur = half; }
  const c = makeCanvas(w, h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, w, h); return c;
}

// The largest rectangle of the given width/height ratio that fits the image, centred. ratio null = the whole image.
export function fitRect(W, H, ratio) {
  if (!ratio) return {x: 0, y: 0, w: W, h: H};
  let w = W, h = W / ratio; if (h > H) { h = H; w = H * ratio; }
  return {x: (W - w) / 2, y: (H - h) / 2, w, h};
}
// Drag a corner of the crop box. corner is 'nw' | 'ne' | 'sw' | 'se'; (dx, dy) is the pointer move in image pixels.
export function dragCorner(start, corner, dx, dy, ratio, W, H) {
  const ax = corner.includes('w') ? start.x + start.w : start.x, ay = corner.includes('n') ? start.y + start.h : start.y;
  const px = Math.min(W, Math.max(0, (corner.includes('w') ? start.x : start.x + start.w) + dx));
  const py = Math.min(H, Math.max(0, (corner.includes('n') ? start.y : start.y + start.h) + dy));
  const sx = px >= ax ? 1 : -1, sy = py >= ay ? 1 : -1;
  let w = Math.abs(px - ax), h = Math.abs(py - ay);
  if (ratio) {
    w = Math.max(w, h * ratio); h = w / ratio;
    const aw = sx > 0 ? W - ax : ax, ah = sy > 0 ? H - ay : ay;
    if (w > aw) { w = aw; h = w / ratio; } if (h > ah) { h = ah; w = h * ratio; }
  }
  w = Math.max(w, 8); h = ratio ? w / ratio : Math.max(h, 8);
  return {x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h};
}
export function moveRect(start, dx, dy, W, H) {
  return {...start, x: Math.min(W - start.w, Math.max(0, start.x + dx)), y: Math.min(H - start.h, Math.max(0, start.y + dy))};
}

export const pixelAt = (c, x, y) => { const d = c.getContext('2d', {willReadFrequently: true}).getImageData(Math.min(c.width - 1, Math.max(0, x | 0)), Math.min(c.height - 1, Math.max(0, y | 0)), 1, 1).data; return [d[0], d[1], d[2]]; };
export const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

// The usual background is whatever colour the picture's border is: take the median of the border pixels.
export function borderColor(c) {
  const {width: w, height: h} = c, d = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, w, h).data;
  const R = [], G = [], B = [], step = Math.max(1, Math.floor((2 * (w + h)) / 4000));
  const take = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] > 200) { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); } };
  for (let x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
  if (!R.length) return [255, 255, 255];
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(R), med(G), med(B)];
}

// Remove the background: every pixel close to `color` that connects to the picture's edge becomes transparent
// (global: every such pixel anywhere, which also clears holes such as the gap inside a handle). `soft` feathers the cut edge.
export function removeBackground(src, {color, tolerance = 24, soft = 1, global = false}) {
  const {width: w, height: h} = src, out = copyCanvas(src), g = out.getContext('2d', {willReadFrequently: true});
  const img = g.getImageData(0, 0, w, h), d = img.data, bg = color || borderColor(src);
  const lim = Math.pow(tolerance * 2.2, 2), n = w * h, mask = new Uint8Array(n);
  const near = (p) => { const i = p * 4; if (d[i + 3] < 8) return true; const r = d[i] - bg[0], gg = d[i + 1] - bg[1], b = d[i + 2] - bg[2]; return r * r + gg * gg + b * b <= lim; };
  if (global) { for (let p = 0; p < n; p++) if (near(p)) mask[p] = 1; }
  else {
    const q = new Int32Array(n); let head = 0, tail = 0;
    const seed = (p) => { if (!mask[p] && near(p)) { mask[p] = 1; q[tail++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); } for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (head < tail) {
      const p = q[head++], x = p % w;
      if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (p >= w) seed(p - w); if (p < n - w) seed(p + w);
    }
  }
  let removed = 0; for (let p = 0; p < n; p++) if (mask[p]) removed++;
  if (soft > 0 && removed) {
    // Blur the 0/1 mask; object pixels take the lower of their alpha and the blurred alpha, so the cut edge fades in.
    const r = Math.round(soft), a = new Float32Array(n), t = new Float32Array(n);
    for (let p = 0; p < n; p++) a[p] = mask[p] ? 0 : 1;
    for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    for (let p = 0; p < n; p++) d[p * 4 + 3] = mask[p] ? 0 : Math.round(d[p * 4 + 3] * Math.min(1, a[p] * 1.15));
  } else for (let p = 0; p < n; p++) if (mask[p]) d[p * 4 + 3] = 0;
  g.putImageData(img, 0, 0);
  return {canvas: out, removed: removed / n};
}

// Text on the picture: a caption or watermark. t = {text, size (% of width), color, pos 'tl'..'br', bold, outline, opacity}.
export function drawText(g, W, H, t) {
  const lines = t.text.split('\n').filter((l, i, a) => l.trim() || i < a.length - 1); if (!t.text.trim()) return;
  const px = Math.max(8, Math.round(W * t.size / 100)), lh = px * 1.2, m = Math.max(12, px * 0.6);
  g.save(); g.font = `${t.bold ? 700 : 500} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; g.textBaseline = 'top'; g.globalAlpha = t.opacity / 100; g.lineJoin = 'round';
  const bw = Math.max(...lines.map((l) => g.measureText(l).width)), bh = lines.length * lh, col = t.pos[1], row = t.pos[0];
  const bx = col === 'l' ? m : col === 'r' ? W - m - bw : (W - bw) / 2, by = row === 't' ? m : row === 'b' ? H - m - bh : (H - bh) / 2;
  g.textAlign = col === 'l' ? 'left' : col === 'r' ? 'right' : 'center';
  const ax = col === 'l' ? bx : col === 'r' ? bx + bw : bx + bw / 2;
  const [r, gr, b] = [1, 3, 5].map((i) => parseInt(t.color.slice(i, i + 2), 16)), dark = (0.299 * r + 0.587 * gr + 0.114 * b) < 140;
  lines.forEach((l, i) => { const y = by + i * lh; if (t.outline) { g.strokeStyle = dark ? '#fff' : '#000'; g.lineWidth = Math.max(2, px / 7); g.strokeText(l, ax, y); } g.fillStyle = t.color; g.fillText(l, ax, y); });
  g.restore();
}
export const addText = (src, t) => { const c = copyCanvas(src); drawText(c.getContext('2d'), c.width, c.height, t); return c; };

// Live and export use the same recipe. `scale` turns image pixels into the pixels of the surface it is drawn on (for blur).
export const filterCss = (a, scale = 1) => `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) grayscale(${a.gray}%) sepia(${a.sepia}%) blur(${(a.blur * scale).toFixed(2)}px)`;
export const isNeutral = (a) => Object.keys(NEUTRAL).every((k) => a[k] === NEUTRAL[k]);

const TYPES = {png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp'};
export async function exportBlob(src, adj, {format, quality}) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  if (format === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } // JPEG has no transparency
  if (FILTER_OK && !isNeutral(adj)) g.filter = filterCss(adj);
  g.drawImage(src, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, TYPES[format], quality / 100));
  if (!blob) throw new Error('This browser could not make a ' + format.toUpperCase() + ' file. Try PNG.');
  return blob;
}
