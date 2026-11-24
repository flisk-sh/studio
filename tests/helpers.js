// Files are made inside the page (canvas, hand-written PDF) so the tests need no fixtures.
export async function give(page, specs) {
  await page.evaluate(async (specs) => {
    const mkimg = async (s) => {
      const k = document.createElement('canvas'); k.width = s.w; k.height = s.h; const g = k.getContext('2d');
      if (s.draw === 'transparent') { g.fillStyle = 'red'; g.fillRect(s.w / 4, s.h / 4, 50, 50); }
      else if (s.draw === 'subject') { g.fillStyle = '#2b6cff'; g.fillRect(0, 0, s.w, s.h); g.fillStyle = '#e53935'; g.beginPath(); g.arc(s.w / 2, s.h / 2, Math.min(s.w, s.h) / 4, 0, 7); g.fill(); }
      else if (s.draw === 'text') { g.fillStyle = '#fff'; g.fillRect(0, 0, s.w, s.h); g.fillStyle = '#111'; g.font = s.w / 45 + 'px sans-serif'; for (let i = 0; i < 12; i++) g.fillText('Row ' + i + ' Invoice 114 Total 1,240.00 EUR IBAN SI56 1920', s.w / 40, s.w / 25 * (i + 1)); }
      else { for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${i * 7 % 360},70%,50%)`; g.fillRect(Math.random() * s.w, Math.random() * s.h, s.w / 8, s.h / 8); } }
      const type = s.type || 'image/png';
      return new File([await new Promise((r) => k.toBlob(r, type, 0.92))], s.name, {type});
    };
    const mkpdf = (s) => {
      const objs = ['<</Type/Catalog/Pages 2 0 R>>']; const kids = []; for (let i = 0; i < s.pages; i++) kids.push(`${4 + i * 2} 0 R`);
      objs.push(`<</Type/Pages/Kids[${kids.join(' ')}]/Count ${s.pages}>>`); objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
      for (let i = 0; i < s.pages; i++) { let c = 'BT /F1 11 Tf 40 780 Td 14 TL\n'; for (let l = 0; l < 50; l++) c += `(Page ${i + 1} line ${l} Invoice 114 Total 1,240.00 EUR IBAN SI56 1920 1001 2345 678) '\n`; c += 'ET';
        objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 3 0 R>>>>/Contents ${5 + i * 2} 0 R>>`); objs.push(`<</Length ${c.length}>>stream\n${c}\nendstream`); }
      let t = '%PDF-1.4\n'; const xr = []; objs.forEach((x, i) => { xr.push(t.length); t += `${i + 1} 0 obj\n${x}\nendobj\n`; });
      const xo = t.length; t += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + xr.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xo}\n%%EOF`;
      return new File([t], s.name, {type: 'application/pdf'});
    };
    // A scanned-book style PDF: one already-compressed JPEG per page, no text.
    const mkscan = async (s) => {
      const k = document.createElement('canvas'); k.width = s.w; k.height = s.h; const g = k.getContext('2d');
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, s.w, s.h);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() * 90 | 0},${Math.random() * 90 | 0},${Math.random() * 90 | 0},.7)`; g.fillRect(Math.random() * s.w, Math.random() * s.h, 6 + Math.random() * 40, 3 + Math.random() * 6); }
      const jb = new Uint8Array(await (await new Promise((r) => k.toBlob(r, 'image/jpeg', s.q))).arrayBuffer());
      const enc = new TextEncoder(), parts = []; let len = 0; const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; }; const xr = [];
      const obj = (n, fn) => { xr[n] = len; push(`${n} 0 obj\n`); fn(); push('\nendobj\n'); };
      push('%PDF-1.4\n'); obj(1, () => push('<</Type/Catalog/Pages 2 0 R>>')); const kids = []; for (let i = 0; i < s.pages; i++) kids.push(`${4 + i * 3} 0 R`);
      obj(2, () => push(`<</Type/Pages/Kids[${kids.join(' ')}]/Count ${s.pages}>>`)); obj(3, () => push('<<>>'));
      for (let i = 0; i < s.pages; i++) { const base = 4 + i * 3;
        obj(base, () => push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</XObject<</Im0 ${base + 1} 0 R>>>>/Contents ${base + 2} 0 R>>`));
        obj(base + 1, () => { push(`<</Type/XObject/Subtype/Image/Width ${s.w}/Height ${s.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jb.length}>>stream\n`); push(jb); push('\nendstream'); });
        const c = 'q 595 0 0 842 0 0 cm /Im0 Do Q'; obj(base + 2, () => push(`<</Length ${c.length}>>stream\n${c}\nendstream`)); }
      const xo = len, total = 4 + s.pages * 3; push(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let n = 1; n < total; n++) push(String(xr[n]).padStart(10, '0') + ' 00000 n \n');
      push(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xo}\n%%EOF`); return new File(parts, s.name, {type: 'application/pdf'});
    };
    const files = [];
    for (const s of specs) files.push(s.kind === 'scanpdf' ? await mkscan(s) : s.kind === 'pdf' ? mkpdf(s) : s.kind === 'raw' ? new File([new Uint8Array(s.bytes)], s.name, {type: s.type}) : await mkimg(s));
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    const input = document.querySelector('input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
  }, specs);
}
export const task = (page, name) => page.locator('.side-item', {hasText: name}).click();
export const process = (page) => page.getByRole('button', {name: 'Process', exact: true}).click();
export const done = (page) => page.getByText(/^(Done\.|Merged|Failed|One of|This PDF)/).first();
export async function setSize(page, label) { await page.getByRole('button', {name: label}).click(); }
