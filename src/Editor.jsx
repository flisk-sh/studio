import {useState, useEffect, useRef, useCallback} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Slider} from '@astryxdesign/core/Slider';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Banner} from '@astryxdesign/core/Banner';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {SparklesIcon, ScissorsIcon, ArrowPathIcon, AdjustmentsHorizontalIcon, ArrowsPointingOutIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, ArrowDownTrayIcon, PhotoIcon, PencilSquareIcon, Squares2X2Icon, PaintBrushIcon, TrashIcon} from '@heroicons/react/24/outline';
import {NEUTRAL, FILTER_OK, MAX_EDGE, loadCanvas, cropCanvas, rotateCanvas, flipCanvas, resizeCanvas, addText, drawText, fitRect, dragCorner, moveRect, pixelAt, hex, borderColor, removeBackground, findPieces, composeLayers, drawLayers, hitLayer, fillBehind, stampLine, copyCanvas, filterCss, isNeutral, exportBlob} from './editor-engine.js';

const TOOLS = [['bg', 'Remove background', SparklesIcon], ['crop', 'Crop', ScissorsIcon], ['turn', 'Rotate & flip', ArrowPathIcon], ['adjust', 'Adjust', AdjustmentsHorizontalIcon], ['size', 'Resize', ArrowsPointingOutIcon], ['text', 'Text', PencilSquareIcon], ['pieces', 'Move pieces', Squares2X2Icon], ['brush', 'Brush', PaintBrushIcon]];
const RATIOS = [['free', 'Free', null], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:2', '3:2', 3 / 2], ['16:9', '16:9', 16 / 9], ['3:4', '3:4', 3 / 4], ['9:16', '9:16', 9 / 16]];
const LOOKS = [['Original', NEUTRAL], ['Vivid', {...NEUTRAL, contrast: 112, saturation: 140}], ['Warm', {...NEUTRAL, sepia: 30, saturation: 115, brightness: 104}], ['Soft', {...NEUTRAL, contrast: 88, brightness: 106, blur: 0.6}], ['Black & white', {...NEUTRAL, gray: 100, contrast: 108}], ['Sepia', {...NEUTRAL, sepia: 85}]];
// Only chat may command Studio, and only from its own origin (a local one for development).
const isChat = (o) => o === 'https://chat.flisk.si' || /^http:\/\/localhost(:\d+)?$/.test(o);
const HISTORY = 8;
const BEHIND = [['White', '#ffffff'], ['Black', '#000000'], ['Grey', '#9aa0a6'], ['Blue', '#2b6cff'], ['Green', '#2f9e5b'], ['Yellow', '#ffd400'], ['Red', '#e53935']];
const thumbs = new WeakMap();
const thumb = (c) => { let u = thumbs.get(c); if (!u) { const k = Math.min(1, 44 / Math.max(c.width, c.height)), t = document.createElement('canvas'); t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); u = t.toDataURL(); thumbs.set(c, u); } return u; };
const COLORS = [['White', '#ffffff'], ['Black', '#000000'], ['Red', '#e53935'], ['Yellow', '#ffd400'], ['Green', '#2f9e5b']];
const POS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Middle centre'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];
const TEXT0 = {text: '', size: 6, color: '#ffffff', pos: 'bc', bold: true, outline: true, opacity: 100};
const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
const kbs = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB';

const Row = ({label, value, children}) => (
  <div className="ed-row"><div className="ed-row-h"><Text type="supporting" weight="semibold">{label}</Text><Text type="supporting" color="secondary" className="ed-val">{value}</Text></div>{children}</div>
);
const Pick = ({value, set, options}) => (
  <HStack gap={2} wrap="wrap">{options.map(([id, label]) => <Button key={id} label={label} size="sm" variant={value === id ? 'primary' : 'secondary'} onClick={() => set(id)} />)}</HStack>
);

export default function Editor() {
  const [hist, setHist] = useState({past: [], cur: null, future: []});
  const [name, setName] = useState('photo');
  const [note, setNote] = useState('');
  const [tool, setTool] = useState('bg');
  const [adj, setAdj] = useState(NEUTRAL);
  const [zoom, setZoom] = useState(null), [fitScale, setFitScale] = useState(1);
  const [crop, setCrop] = useState(null), [ratio, setRatio] = useState('free');
  const [bgColor, setBgColor] = useState(null), [picking, setPicking] = useState(false), [tol, setTol] = useState(24), [soft, setSoft] = useState(1), [global, setGlobal] = useState(false);
  const [rw, setRw] = useState(0), [txt, setTxt] = useState(TEXT0);
  const [format, setFormat] = useState('png'), [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false), [over, setOver] = useState(false);
  const [lh, setLh] = useState({past: [], cur: null, future: []}), [sel, setSel] = useState([]), [brush, setBrush] = useState({mode: 'restore', size: 4});
  const [custom, setCustom] = useState('#ff8a00');
  const layers = lh.cur, lref = useRef(null); lref.current = lh;
  const cur = hist.cur, W = cur ? cur.width : 0, H = cur ? cur.height : 0;
  const stageRef = useRef(null), canvasRef = useRef(null), fileRef = useRef(null), drag = useRef(null), work = useRef(null), cursorRef = useRef(null);
  const scale = zoom === null ? fitScale : zoom / 100;

  const commit = useCallback((c, msg, bg) => { if (bg) c.__bg = bg; setHist((h) => ({past: h.past.concat(h.cur ? [h.cur] : []).slice(-HISTORY), cur: c, future: []})); setCrop(null); setNote(msg || ''); }, []);
  const lundo = () => setLh((l) => l.past.length ? {past: l.past.slice(0, -1), cur: l.past[l.past.length - 1], future: [l.cur].concat(l.future)} : l);
  const lredo = () => setLh((l) => l.future.length ? {past: l.past.concat([l.cur]), cur: l.future[0], future: l.future.slice(1)} : l);
  const undo0 = useCallback(() => setHist((h) => h.past.length ? {past: h.past.slice(0, -1), cur: h.past[h.past.length - 1], future: [h.cur].concat(h.future)} : h), []);
  const redo0 = useCallback(() => setHist((h) => h.future.length ? {past: h.past.concat([h.cur]), cur: h.future[0], future: h.future.slice(1)} : h), []);

  const toolRef = useRef(tool); toolRef.current = tool;
  const undo = useCallback(() => { if (toolRef.current === 'pieces' && lref.current.past.length) lundo(); else undo0(); }, [undo0]);
  const redo = useCallback(() => { if (toolRef.current === 'pieces' && lref.current.future.length) lredo(); else redo0(); }, [redo0]);
  const act = useRef({});

  const open = async (file) => {
    if (!file) return;
    setBusy(true); setNote('');
    try {
      const r = await loadCanvas(file);
      setHist({past: [], cur: r.canvas, future: []}); setName(file.name.replace(/\.[^.]+$/, '') || 'photo'); setAdj(NEUTRAL); setZoom(null); setCrop(null); setBgColor(null); setPicking(false); setRatio('free');
      setNote(r.scaled ? `Large photo: scaled from ${r.from[0]} × ${r.from[1]} to fit ${MAX_EDGE} px for editing.` : '');
    } catch (e) { setNote('This image could not be read. HEIC photos are not supported in this browser yet: export them as JPEG first.'); }
    setBusy(false);
  };

  // The visible canvas is a copy of the current picture; CSS applies the adjustments live.
  useEffect(() => { const c = canvasRef.current; if (!c || !cur) return; c.width = cur.width; c.height = cur.height; const g = c.getContext('2d'); if (tool === 'pieces' && layers) drawLayers(g, layers, null, cur.width, cur.height); else g.drawImage(cur, 0, 0); if (tool === 'text') drawText(g, cur.width, cur.height, txt); }, [cur, tool, txt, layers]);
  // Entering Move pieces cuts the picture into one layer per separate piece.
  useEffect(() => { setSel([]); setLh({past: [], cur: tool === 'pieces' && cur ? findPieces(cur).map((l) => ({...l, ox: l.x, oy: l.y})) : null, future: []}); }, [tool, cur]);
  useEffect(() => { if (cur) setRw(cur.width); }, [cur]);
  // "Fit" follows the size of the stage.
  useEffect(() => {
    const el = stageRef.current; if (!el || !cur) return;
    const f = () => setFitScale(Math.min(1, Math.max(0.02, Math.min((el.clientWidth - 40) / cur.width, (el.clientHeight - 40) / cur.height))));
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, [cur]);
  useEffect(() => {
    const key = (e) => {
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (toolRef.current === 'pieces' && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); act.current.del(); }
      else if (toolRef.current === 'pieces' && e.key.startsWith('Arrow')) { e.preventDefault(); const k = e.shiftKey ? 10 : 1; act.current.nudge(e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0, e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0); }
    };
    const paste = (e) => { const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/')); if (f) open(f); };
    window.addEventListener('keydown', key); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('paste', paste); };
  }, [undo, redo]);
  // Entering the crop tool starts with the whole picture selected.
  useEffect(() => { if (tool === 'crop' && cur && !crop) setCrop(fitRect(W, H, (RATIOS.find((r) => r[0] === ratio) || [])[2])); if (tool !== 'crop') setCrop(null); if (tool !== 'bg') setPicking(false); }, [tool, cur]);

  const setRatioId = (id) => { setRatio(id); if (cur) setCrop(fitRect(W, H, RATIOS.find((r) => r[0] === id)[2])); };
  const ratioNum = (RATIOS.find((r) => r[0] === ratio) || [])[2];
  const autoColor = cur && tool === 'bg' ? borderColor(cur) : null;
  const shownColor = bgColor || autoColor;

  const toImg = (e) => { const r = canvasRef.current.getBoundingClientRect(); return {x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale}; };
  const hasBg = !!(cur && cur.__bg && cur.__bg.width === W && cur.__bg.height === H);
  const radius = () => Math.max(2, W * brush.size / 200);
  const paint = (a, b) => { const r = radius(); stampLine(work.current.getContext('2d'), a, b, r, brush.mode, cur.__bg); stampLine(canvasRef.current.getContext('2d'), a, b, r, brush.mode, cur.__bg); };
  const down = (e) => {
    if (tool === 'pieces' && layers) {
      const p = toImg(e), hit = hitLayer(layers, p.x, p.y);
      if (!hit) { if (!e.shiftKey) setSel([]); return; }
      let ids = sel;
      if (e.shiftKey) ids = sel.includes(hit.id) ? sel.filter((i) => i !== hit.id) : sel.concat(hit.id); else if (!sel.includes(hit.id)) ids = [hit.id];
      setSel(ids); if (!ids.includes(hit.id)) return;
      e.currentTarget.setPointerCapture(e.pointerId); drag.current = {pieces: true, x: e.clientX, y: e.clientY, start: layers, ids, moved: false}; return;
    }
    if (tool === 'brush' && cur) {
      if (brush.mode === 'restore' && !hasBg) { setNote('There is nothing to restore here: the background was not removed in this picture, or it was cropped, rotated or resized since.'); return; }
      e.currentTarget.setPointerCapture(e.pointerId); const w = copyCanvas(cur), p = toImg(e); work.current = w; drag.current = {brush: true, last: p}; paint(p, p); return;
    }
    const h = e.target.dataset.h; if (!h || !crop) return;
    e.currentTarget.setPointerCapture(e.pointerId); drag.current = {h, x: e.clientX, y: e.clientY, start: crop};
  };
  const move = (e) => {
    if (tool === 'brush' && cursorRef.current) { const p = toImg(e), r = radius() * scale; Object.assign(cursorRef.current.style, {display: 'block', left: p.x * scale - r + 'px', top: p.y * scale - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px'}); }
    const d = drag.current; if (!d) return;
    if (d.brush) { const p = toImg(e); paint(d.last, p); d.last = p; return; }
    const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale;
    if (d.pieces) { if (Math.abs(dx) + Math.abs(dy) < 2 && !d.moved) return; d.moved = true; setLh((l) => ({...l, cur: d.start.map((L) => d.ids.includes(L.id) ? {...L, x: L.x + dx, y: L.y + dy} : L)})); return; }
    setCrop(d.h === 'move' ? moveRect(d.start, dx, dy, W, H) : dragCorner(d.start, d.h, dx, dy, ratioNum, W, H));
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (d.brush && work.current) { commit(work.current, brush.mode === 'restore' ? 'Background brought back where you painted.' : 'Erased where you painted.', cur.__bg); work.current = null; }
    if (d.pieces && d.moved) setLh((l) => ({past: l.past.concat([d.start]).slice(-30), cur: l.cur, future: []}));
  };
  const lpush = (next) => setLh((l) => ({past: l.past.concat([l.cur]).slice(-30), cur: next, future: []}));
  const ids = new Set(sel), picked = layers ? layers.filter((l) => ids.has(l.id)) : [];
  const moved = !!layers && layers.some((l) => l.ox !== undefined && (Math.round(l.x) !== l.ox || Math.round(l.y) !== l.oy));
  const dirty = !!lh.past.length, flat = () => composeLayers(layers, null, W, H);
  const delSel = () => { if (picked.length) { lpush(layers.filter((l) => !ids.has(l.id))); setSel([]); } };
  act.current = {del: delSel, nudge: (dx, dy) => { if (picked.length) lpush(layers.map((l) => ids.has(l.id) ? {...l, x: l.x + dx, y: l.y + dy} : l)); }};
  const keepSel = () => { if (picked.length) lpush(picked); };
  const toFront = () => picked.length && lpush(layers.filter((l) => !ids.has(l.id)).concat(picked));
  const toBack = () => picked.length && lpush(picked.concat(layers.filter((l) => !ids.has(l.id))));
  const dupSel = () => { if (!picked.length) return; const copies = picked.map((l) => ({...l, id: Date.now() + Math.random(), x: l.x + 24, y: l.y + 24})); lpush(layers.concat(copies)); setSel(copies.map((l) => l.id)); };
  const applyPieces = () => commit(flat(), 'Pieces applied.', moved ? null : cur.__bg);
  const pickTool = (id) => { if (tool === 'pieces' && dirty && layers) applyPieces(); setTool(id); };
  const bringBack = () => { commit(copyCanvas(cur.__bg), 'The background is back. Remove it again with other settings, or use the Brush to bring back only some of it.', cur.__bg); setFormat('png'); };
  const behind = (color) => { commit(fillBehind(tool === 'pieces' && layers ? flat() : cur, color), 'Colour added behind the picture.', null); };
  const BackRow = () => hasBg ? <Button label="Put background back" size="sm" variant="secondary" icon={<ArrowUturnLeftIcon width="16" height="16" />} onClick={bringBack} /> : null;
  const BehindRow = () => (
    <Row label="Colour behind" value=""><HStack gap={2} wrap="wrap" align="center">{BEHIND.map(([l, v]) => <button type="button" key={l} className="ed-dot" aria-label={'Put ' + l.toLowerCase() + ' behind the picture'} title={l} style={{background: v}} onClick={() => behind(v)} />)}<label className="ed-dot ed-dot-any" title="Any colour"><input type="color" aria-label="Pick any colour" value={custom} onChange={(e) => setCustom(e.target.value)} /></label><Button label="Use this colour" size="sm" variant="secondary" onClick={() => behind(custom)} /></HStack></Row>
  );

  const onCanvasClick = (e) => {
    if (!picking || !cur) return;
    const r = canvasRef.current.getBoundingClientRect();
    setBgColor(pixelAt(cur, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)); setPicking(false);
  };

  // reply({ok, note}) is how a voice command from chat hears the result.
  const doRemove = (reply) => {
    setBusy(true);
    setTimeout(() => { // let "Working…" paint first
      const r = removeBackground(cur, {color: bgColor, tolerance: tol, soft, global});
      if (r.removed < 0.0005) { const note = 'Nothing matched. Raise the tolerance, or pick the background colour from the picture.'; setNote(note); setBusy(false); reply && reply({ok: false, note}); return; }
      const note = r.removed > 0.97 ? 'Almost everything was removed. Undo, and lower the tolerance.' : `Background removed (${Math.round(r.removed * 100)}% of the picture). Click a piece and drag it, Shift-click to pick several, Delete removes. Not right? Undo, or Put background back.`;
      commit(r.canvas, note, cur.__bg || cur);
      setFormat('png'); setBusy(false); if (r.removed <= 0.97) setTool('pieces');
      reply && reply({ok: r.removed <= 0.97, note});
    }, 20);
  };
  // Commands from the chat that frames Studio (chat.flisk.si): "remove the background", "crop to square". See studio-embed.js.
  const command = (m, reply) => {
    if (!cur) { reply({ok: false, note: 'Open a photo in Studio first, then ask again.'}); return; }
    if (busy) { reply({ok: false, note: 'Studio is still working. Ask again in a moment.'}); return; }
    if (m.cmd === 'removeBackground') { setTool('bg'); doRemove(reply); return; }
    if (m.cmd === 'crop') {
      const row = RATIOS.find((r) => r[0] === m.ratio);
      if (!row || !row[2]) { setTool('crop'); reply({ok: false, note: 'Which shape? Say square, 16:9, 4:3, 3:2, 3:4 or 9:16.'}); return; }
      const box = fitRect(W, H, row[2]), w = Math.round(box.w), h = Math.round(box.h);
      if (w === W && h === H) { reply({ok: false, note: `The photo is already ${row[1]}.`}); return; }
      setTool('crop'); setRatio(row[0]);
      const note = `Cropped to ${row[1]}: ${w} × ${h} px.`; commit(cropCanvas(cur, box), note); reply({ok: true, note});
    }
  };
  const cmdRef = useRef(null); cmdRef.current = command;
  useEffect(() => {
    const m = (e) => {
      if (!isChat(e.origin) || !e.data || e.data.flisk !== 'studio' || !e.data.cmd || e.data.type === 'reply') return;
      cmdRef.current(e.data, (r) => e.source && e.source.postMessage({flisk: 'studio', type: 'reply', cmd: e.data.cmd, ...r}, e.origin));
    };
    window.addEventListener('message', m); return () => window.removeEventListener('message', m);
  }, []);
  const doDownload = async () => {
    setBusy(true);
    try { const pending = tool === 'text' && txt.text.trim(), base = tool === 'pieces' && dirty && layers ? flat() : cur; const b = await exportBlob(pending ? addText(base, txt) : base, adj, {format, quality}); save(b, `${name}-edited.${format}`); setNote(`Saved ${name}-edited.${format} (${W} × ${H} px, ${kbs(b.size)}).`); }
    catch (e) { setNote(String(e.message || e)); }
    setBusy(false);
  };
  const reset = () => { setHist((h) => h.past.length ? {past: [], cur: h.past[0], future: []} : h); setAdj(NEUTRAL); setCrop(null); setNote('Back to the original.'); };
  const setA = (k) => (v) => setAdj((a) => ({...a, [k]: v}));
  const applyResize = (w) => { w = Math.min(MAX_EDGE, Math.max(1, Math.round(w))); if (w === W) return; commit(resizeCanvas(cur, w, H * w / W), `Resized to ${w} × ${Math.round(H * w / W)} px.`); };
  const cropped = crop && cur && (Math.round(crop.w) !== W || Math.round(crop.h) !== H);
  const dropFile = (e) => { e.preventDefault(); setOver(false); open([...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))); };
  const style = cur ? {width: Math.round(W * scale), height: Math.round(H * scale)} : null;

  return (
    <div className="ed" aria-label="Photo editor">
      <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose a photo to edit" onChange={(e) => { open(e.target.files[0]); e.target.value = ''; }} />
      <div className="ed-bar">
        <HStack gap={2} align="center" wrap="wrap">
          <Button label={cur ? 'Open another' : 'Open photo'} size="sm" variant="secondary" icon={<PhotoIcon width="16" height="16" />} onClick={() => fileRef.current.click()} />
          <Button label="Undo" size="sm" variant="ghost" icon={<ArrowUturnLeftIcon width="16" height="16" />} isDisabled={!hist.past.length} onClick={undo} />
          <Button label="Redo" size="sm" variant="ghost" icon={<ArrowUturnRightIcon width="16" height="16" />} isDisabled={!hist.future.length} onClick={redo} />
          <Button label="Reset" size="sm" variant="ghost" isDisabled={!hist.past.length && isNeutral(adj)} onClick={reset} />
        </HStack>
        {cur && <Text type="supporting" color="secondary" className="ed-dims">{W} × {H} px · {name}</Text>}
      </div>

      <div className="ed-main">
        <div className="ed-left">
          {cur && (
            <HStack gap={3} align="center" className="zoombar">
              <Text type="supporting" color="secondary">Zoom</Text>
              <div className="zoom-slider"><Slider label="Zoom" isLabelHidden min={5} max={400} step={5} value={Math.round(scale * 100)} onChange={(v) => setZoom(v)} valueDisplay="none" /></div>
              <Text weight="semibold" className="zoom-pct">{Math.round(scale * 100)}%</Text>
              <Button label="Fit" size="sm" variant={zoom === null ? 'primary' : 'secondary'} onClick={() => setZoom(null)} />
              <Button label="100%" size="sm" variant={zoom === 100 ? 'primary' : 'secondary'} onClick={() => setZoom(100)} />
            </HStack>)}
          <div className={'ed-stage' + (over ? ' over' : '')} ref={stageRef} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={dropFile}>
            {!cur && (
              <button type="button" className="ed-empty" onClick={() => fileRef.current.click()}>
                <PhotoIcon width="36" height="36" />
                <Text weight="semibold">{busy ? 'Opening…' : 'Choose a photo, drop it here, or paste it'}</Text>
                <Text type="supporting" color="secondary">Your photo stays on your computer.</Text>
              </button>)}
            {cur && (
              <div className={'ed-frame' + (picking ? ' picking' : '') + (tool === 'pieces' ? ' pieces' : '') + (tool === 'brush' ? ' brushing' : '')} style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.display = 'none'; }}>
                <canvas ref={canvasRef} className="ed-canvas" aria-label="Photo being edited" onClick={onCanvasClick} style={FILTER_OK ? {filter: filterCss(adj, scale)} : undefined} />
                {tool === 'pieces' && picked.map((l) => <div key={l.id} className="ed-sel" style={{left: Math.round(l.x) * scale, top: Math.round(l.y) * scale, width: l.c.width * scale, height: l.c.height * scale}} />)}
                {tool === 'brush' && <div ref={cursorRef} className="ed-brush-ring" />}
                {tool === 'crop' && crop && (
                  <div className="ed-crop" data-h="move" style={{left: crop.x * scale, top: crop.y * scale, width: crop.w * scale, height: crop.h * scale}}>
                    {['nw', 'ne', 'sw', 'se'].map((c) => <span key={c} data-h={c} className={'ed-handle ' + c} />)}
                  </div>)}
              </div>)}
          </div>
          {note && <Text color="secondary" className="ed-msg" role="status">{note}</Text>}
        </div>

        <aside className="inspector ed-insp" aria-label="Editing tools">
          <div className="inspector-h">Tools</div>
          <div className="ed-tools" role="tablist" aria-label="Tool">
            {TOOLS.map(([id, label, Ic]) => <button type="button" role="tab" key={id} aria-selected={tool === id} className={'ed-tool' + (tool === id ? ' on' : '')} onClick={() => pickTool(id)}><Ic width="18" height="18" /><span>{label}</span></button>)}
          </div>

          {!cur ? <Text color="secondary">Open a photo to start. Remove its background, crop, rotate, adjust the light and colour, or resize it.</Text> : (
            <VStack gap={3} className="ed-panel">
              {tool === 'bg' && (<>
                <Text type="supporting" color="secondary">Works best on a plain backdrop: a wall, paper, a studio sheet, a product on white.</Text>
                <Row label="Background colour" value={hex(shownColor)}>
                  <HStack gap={2} align="center"><span className="ed-swatch" style={{background: hex(shownColor)}} /><Button label={picking ? 'Click the picture…' : 'Pick from picture'} size="sm" variant={picking ? 'primary' : 'secondary'} onClick={() => setPicking((p) => !p)} />{bgColor && <Button label="Auto" size="sm" variant="ghost" onClick={() => setBgColor(null)} />}</HStack>
                </Row>
                <Row label="Tolerance" value={tol}><Slider label="Tolerance" isLabelHidden min={2} max={80} value={tol} onChange={setTol} valueDisplay="none" /></Row>
                <Row label="Edge softness" value={soft + ' px'}><Slider label="Edge softness" isLabelHidden min={0} max={6} value={soft} onChange={setSoft} valueDisplay="none" /></Row>
                <label className="ed-check"><input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} /><span>Also clear the same colour inside the subject (holes, gaps)</span></label>
                <Button label={busy ? 'Working…' : 'Remove background'} variant="primary" isDisabled={busy} onClick={() => doRemove()} />
                {BackRow()}{BehindRow()}
              </>)}

              {tool === 'pieces' && layers && (<>
                <Text type="supporting" color="secondary">Click a piece and drag it. Shift-click picks several. Arrow keys nudge, Delete removes.</Text>
                {!layers.length && <Text color="secondary">Nothing visible is left. Undo, or Put background back.</Text>}
                <Row label="Pieces" value={layers.length + (layers.length === 1 ? ' piece' : ' pieces')}>
                  <div className="ed-layers" role="listbox" aria-label="Pieces, top one first" aria-multiselectable="true">
                    {layers.slice().reverse().slice(0, 40).map((l) => <button type="button" role="option" aria-selected={ids.has(l.id)} key={l.id} className={'ed-layer' + (ids.has(l.id) ? ' on' : '')} onClick={(e) => setSel(e.shiftKey ? (ids.has(l.id) ? sel.filter((i) => i !== l.id) : sel.concat(l.id)) : [l.id])}><img src={thumb(l.c)} alt="" /><span>{l.c.width} × {l.c.height}</span></button>)}
                  </div>
                </Row>
                <HStack gap={2} wrap="wrap">
                  <Button label="Select all" size="sm" variant="secondary" isDisabled={!layers.length} onClick={() => setSel(layers.map((l) => l.id))} />
                  <Button label="Select none" size="sm" variant="ghost" isDisabled={!sel.length} onClick={() => setSel([])} />
                </HStack>
                <HStack gap={2} wrap="wrap">
                  <Button label="Keep only selected" size="sm" variant="secondary" isDisabled={!picked.length || picked.length === layers.length} onClick={keepSel} />
                  <Button label="Delete selected" size="sm" variant="secondary" icon={<TrashIcon width="16" height="16" />} isDisabled={!picked.length} onClick={delSel} />
                  <Button label="Duplicate" size="sm" variant="secondary" isDisabled={!picked.length} onClick={dupSel} />
                  <Button label="To front" size="sm" variant="secondary" isDisabled={!picked.length} onClick={toFront} />
                  <Button label="To back" size="sm" variant="secondary" isDisabled={!picked.length} onClick={toBack} />
                </HStack>
                <Button label="Apply" variant="primary" isDisabled={!dirty} onClick={applyPieces} />
                {BackRow()}{BehindRow()}
              </>)}

              {tool === 'brush' && (<>
                <Text type="supporting" color="secondary">Paint on the picture. Restore brings the original back where you paint; Erase makes it transparent.</Text>
                <Row label="Brush" value=""><Pick value={brush.mode} set={(m) => setBrush((b) => ({...b, mode: m}))} options={[['restore', 'Restore'], ['erase', 'Erase']]} /></Row>
                <Row label="Size" value={brush.size + '%'}><Slider label="Brush size" isLabelHidden min={1} max={20} value={brush.size} onChange={(v) => setBrush((b) => ({...b, size: v}))} valueDisplay="none" /></Row>
                {brush.mode === 'restore' && !hasBg && <Text type="supporting" color="secondary">Restore works after Remove background, until you crop, rotate or resize.</Text>}
                {BackRow()}
              </>)}

              {tool === 'crop' && (<>
                <Row label="Shape" value={crop ? `${Math.round(crop.w)} × ${Math.round(crop.h)} px` : ''}><Pick value={ratio} set={setRatioId} options={RATIOS.map(([id, l]) => [id, l])} /></Row>
                <Text type="supporting" color="secondary">Drag the box to move it, and its corners to resize.</Text>
                <HStack gap={2}><Button label="Apply crop" variant="primary" isDisabled={!cropped} onClick={() => commit(cropCanvas(cur, crop), `Cropped to ${Math.round(crop.w)} × ${Math.round(crop.h)} px.`)} /><Button label="Reset box" variant="ghost" onClick={() => setCrop(fitRect(W, H, ratioNum))} /></HStack>
              </>)}

              {tool === 'turn' && (<>
                <Row label="Rotate" value=""><HStack gap={2} wrap="wrap"><Button label="Rotate left" size="sm" variant="secondary" onClick={() => commit(rotateCanvas(cur, -1), 'Rotated left.')} /><Button label="Rotate right" size="sm" variant="secondary" onClick={() => commit(rotateCanvas(cur, 1), 'Rotated right.')} /></HStack></Row>
                <Row label="Flip" value=""><HStack gap={2} wrap="wrap"><Button label="Flip horizontal" size="sm" variant="secondary" onClick={() => commit(flipCanvas(cur, 'h'), 'Flipped left to right.')} /><Button label="Flip vertical" size="sm" variant="secondary" onClick={() => commit(flipCanvas(cur, 'v'), 'Flipped top to bottom.')} /></HStack></Row>
              </>)}

              {tool === 'adjust' && (FILTER_OK ? (<>
                <Row label="Looks" value=""><HStack gap={2} wrap="wrap">{LOOKS.map(([l, v]) => <Button key={l} label={l} size="sm" variant={Object.keys(NEUTRAL).every((k) => adj[k] === v[k]) ? 'primary' : 'secondary'} onClick={() => setAdj(v)} />)}</HStack></Row>
                <Row label="Brightness" value={adj.brightness + '%'}><Slider label="Brightness" isLabelHidden min={50} max={150} value={adj.brightness} onChange={setA('brightness')} valueDisplay="none" /></Row>
                <Row label="Contrast" value={adj.contrast + '%'}><Slider label="Contrast" isLabelHidden min={50} max={150} value={adj.contrast} onChange={setA('contrast')} valueDisplay="none" /></Row>
                <Row label="Saturation" value={adj.saturation + '%'}><Slider label="Saturation" isLabelHidden min={0} max={200} value={adj.saturation} onChange={setA('saturation')} valueDisplay="none" /></Row>
                <Row label="Blur" value={adj.blur + ' px'}><Slider label="Blur" isLabelHidden min={0} max={10} step={0.5} value={adj.blur} onChange={setA('blur')} valueDisplay="none" /></Row>
                <Button label="Reset adjustments" size="sm" variant="ghost" isDisabled={isNeutral(adj)} onClick={() => setAdj(NEUTRAL)} />
              </>) : <Banner type="warning" description="This browser cannot adjust light and colour yet. Use a current Chrome, Edge or Firefox." />)}

              {tool === 'size' && (<>
                <Row label="Width" value={`${W} → ${rw} px`}><NumberInput label="Width in pixels" value={rw} onChange={(v) => v && setRw(Math.min(MAX_EDGE, Math.max(1, v)))} /></Row>
                <Text type="supporting" color="secondary">Height follows: {Math.round(H * rw / W)} px. Proportions stay the same.</Text>
                <HStack gap={2} wrap="wrap">{[['25%', W * .25], ['50%', W * .5], ['75%', W * .75], ['1080 wide', 1080], ['1920 wide', 1920]].map(([l, w]) => <Button key={l} label={l} size="sm" variant="secondary" onClick={() => setRw(Math.round(Math.min(MAX_EDGE, w)))} />)}</HStack>
                <Button label="Apply size" variant="primary" isDisabled={rw === W} onClick={() => applyResize(rw)} />
              </>)}

              {tool === 'text' && (<>
                <TextInput label="Text" value={txt.text} onChange={(v) => setTxt((t) => ({...t, text: v}))} />
                <Row label="Size" value={txt.size + '%'}><Slider label="Text size" isLabelHidden min={2} max={30} value={txt.size} onChange={(v) => setTxt((t) => ({...t, size: v}))} valueDisplay="none" /></Row>
                <Row label="Colour" value=""><HStack gap={2} wrap="wrap">{COLORS.map(([l, v]) => <Button key={l} label={l} size="sm" variant={txt.color === v ? 'primary' : 'secondary'} onClick={() => setTxt((t) => ({...t, color: v}))} />)}</HStack></Row>
                <Row label="Position" value=""><div className="ed-pos" role="group" aria-label="Text position">{POS.map(([id, l]) => <button type="button" key={id} aria-label={l} aria-pressed={txt.pos === id} className={'ed-pos-b' + (txt.pos === id ? ' on' : '')} onClick={() => setTxt((t) => ({...t, pos: id}))} />)}</div></Row>
                <Row label="Opacity" value={txt.opacity + '%'}><Slider label="Text opacity" isLabelHidden min={20} max={100} value={txt.opacity} onChange={(v) => setTxt((t) => ({...t, opacity: v}))} valueDisplay="none" /></Row>
                <HStack gap={4}><label className="ed-check"><input type="checkbox" checked={txt.bold} onChange={(e) => setTxt((t) => ({...t, bold: e.target.checked}))} /><span>Bold</span></label><label className="ed-check"><input type="checkbox" checked={txt.outline} onChange={(e) => setTxt((t) => ({...t, outline: e.target.checked}))} /><span>Outline, easier to read</span></label></HStack>
                <Button label="Apply text" variant="primary" isDisabled={!txt.text.trim()} onClick={() => { commit(addText(cur, txt), 'Text added.'); setTxt((t) => ({...t, text: ''})); }} />
              </>)}

              <div className="ed-export">
                <div className="inspector-h">Export</div>
                <VStack gap={3}>
                  <Pick value={format} set={setFormat} options={[['png', 'PNG (keeps transparency)'], ['jpg', 'JPEG (smaller)'], ['webp', 'WebP (smallest)']]} />
                  {format !== 'png' && <Row label="Quality" value={quality + '%'}><Slider label="Quality" isLabelHidden min={30} max={100} value={quality} onChange={setQuality} valueDisplay="none" /></Row>}
                  {format === 'jpg' && <Text type="supporting" color="secondary">JPEG has no transparency: a removed background becomes white. Use PNG or WebP to keep it.</Text>}
                  <Button label={busy ? 'Working…' : 'Download'} variant="primary" size="lg" icon={<ArrowDownTrayIcon width="18" height="18" />} isDisabled={busy} onClick={doDownload} />
                </VStack>
              </div>
            </VStack>)}
        </aside>
      </div>
    </div>
  );
}
