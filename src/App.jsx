import {useState, useEffect, useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {FileInput} from '@astryxdesign/core/FileInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Slider} from '@astryxdesign/core/Slider';
import {Banner} from '@astryxdesign/core/Banner';
import {PhotoIcon, DocumentDuplicateIcon, ArrowsPointingInIcon, PencilSquareIcon, ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, PaintBrushIcon} from '@heroicons/react/24/outline';
import {Demo} from './Demos.jsx';
import Editor from './Editor.jsx';
import {pdfThumb, photoBatch, pdfBatch, matrix, buildVariant, initUnlock, FREE_FOR_NOW, FREE_FILES, MARK, PAYMENT_LINK, UNLOCK_TOKEN} from './engine.js';

const TASKS = [
  ['photo', 'Photos', 'Resize, crop square, compress, add a mark, get a ZIP'],
  ['editor', 'Editor', 'Remove the background, crop, rotate, adjust and resize one photo'],
  ['merge', 'Merge PDFs', 'Join several PDFs into one file'],
  ['shrink', 'Shrink PDFs', 'Make big PDFs small and strip hidden text'],
  ['mark', 'Watermark PDFs', 'Put your text across every page'],
];
const unlockedAtLoad = initUnlock();
const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
const Choice = ({value, set, options}) => (
  <HStack gap={2} wrap="wrap">{options.map(([id, label]) => <Button key={id} label={label} size="sm" variant={value === id ? 'primary' : 'secondary'} onClick={() => set(id)} />)}</HStack>
);

const friendly = (e) => {
  const m = String(e && e.message || e);
  if (/encrypt|password/i.test(m)) return 'This PDF is protected with a password. Remove the password first, then try again.';
  if (/invalid pdf|no pdf header|failed to parse/i.test(m)) return 'One of the files is not a valid PDF.';
  if (/source image|decode|InvalidState|bitmap/i.test(m)) return 'One of the images could not be read. HEIC photos are not supported in this browser yet: export them as JPEG first.';
  return 'Failed: ' + m;
};
// One picked file: a thumbnail, its name and size, and buttons to remove it (and, for merging, to move it).
function PickedFile({file, index, count, canMove, onRemove, onMove}) {
  const [thumb, setThumb] = useState(null), [pages, setPages] = useState(0), [bad, setBad] = useState(false);
  useEffect(() => {
    let dead = false, url = null;
    if (file.type.startsWith('image/')) { url = URL.createObjectURL(file); setThumb(url); }
    else pdfThumb(file).then((r) => { if (!dead) { setThumb(r.url); setPages(r.pages); } }).catch(() => !dead && setBad(true));
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  return (
    <div className="picked">
      <div className="picked-thumb">{thumb ? <img src={thumb} alt="" /> : <span className="picked-wait">{bad ? 'PDF' : '…'}</span>}</div>
      <div className="picked-info">
        <Text weight="semibold" className="picked-name">{file.name}</Text>
        <Text type="supporting" color="secondary">{kbs(file.size)}{pages ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''}{bad ? ' · cannot be read' : ''}</Text>
      </div>
      <HStack gap={1}>
        {canMove && <Button label="Move up" isIconOnly icon={<ChevronUpIcon width="16" height="16" />} size="sm" variant="ghost" isDisabled={index === 0} onClick={() => onMove(index, -1)} />}
        {canMove && <Button label="Move down" isIconOnly icon={<ChevronDownIcon width="16" height="16" />} size="sm" variant="ghost" isDisabled={index === count - 1} onClick={() => onMove(index, 1)} />}
        <Button label={'Remove ' + file.name} isIconOnly icon={<XMarkIcon width="16" height="16" />} size="sm" variant="ghost" onClick={() => onRemove(index)} />
      </HStack>
    </div>
  );
}

const kbs = (n) => (n / 1024).toFixed(0) + ' KB';
function Viewer({result, onClose}) {
  const [open, setOpen] = useState(0);
  const it = result.items[Math.min(open, result.items.length - 1)];
  // Zoom: null means "fit the frame"; a number is a percentage of the image's own pixels.
  const [zoom, setZoom] = useState(null), [nat, setNat] = useState(null), [fitPct, setFitPct] = useState(100);
  const stageRef = useRef(null);
  const onLoad = (e) => {
    const im = e.currentTarget;
    setNat([im.naturalWidth, im.naturalHeight]);
  };
  // In "fit" mode the browser scales the image; read the result back so the slider shows the real percentage.
  useEffect(() => {
    const im = stageRef.current && stageRef.current.querySelector('img');
    if (zoom === null && nat && im) setFitPct(Math.max(1, Math.round(im.clientWidth / nat[0] * 100)));
  }, [zoom, nat]);
  const pick = (i) => { setOpen(i); setZoom(null); setNat(null); };
  return (
    <VStack gap={3} className="viewer">
      <HStack gap={2} align="center" wrap="wrap">
        <Button label={'Download ' + result.name} variant="primary" size="md" onClick={() => save(result.blob, result.name)} />
        <Button label="Close" variant="ghost" size="md" onClick={onClose} />
      </HStack>
      {result.items.length > 1 && (
        <div className="thumbs">{result.items.map((x, i) => (
          <button type="button" key={x.url} className={'thumb' + (i === open ? ' on' : '')} onClick={() => pick(i)} title={x.name}>
            {x.kind === 'image' ? <img src={x.url} alt={x.name} /> : <span className="pdfchip">{x.name}</span>}
          </button>))}
        </div>)}
      <Downloads key={result.blob.size + result.name + result.items.length} result={result} />
      {it.kind === 'image' && (
        <HStack gap={3} align="center" className="zoombar">
          <Text type="supporting" color="secondary">Zoom</Text>
          <div className="zoom-slider"><Slider label="Zoom" isLabelHidden min={5} max={400} step={5} value={zoom ?? fitPct} onChange={(v) => setZoom(v)} valueDisplay="none" /></div>
          <Text weight="semibold" className="zoom-pct">{zoom ?? fitPct}%</Text>
          <Button label="Fit" size="sm" variant={zoom === null ? 'primary' : 'secondary'} onClick={() => setZoom(null)} />
          <Button label="100%" size="sm" variant={zoom === 100 ? 'primary' : 'secondary'} onClick={() => setZoom(100)} />
        </HStack>)}
      <div className={'stage' + (it.kind === 'image' ? ' canvas' : '')} ref={stageRef}>
        {it.kind === 'image'
          ? <div className="frame"><img src={it.url} alt={it.name} onLoad={onLoad} className={zoom === null ? '' : 'zoomed'} style={zoom !== null && nat ? {width: Math.round(nat[0] * zoom / 100), maxWidth: 'none', maxHeight: 'none'} : undefined} /></div>
          : <iframe title={it.name} src={it.url} />}
      </div>
      {it.kind === 'image' && Math.max(...String(it.dims).split(' × ').map(Number)) < 1000 && <Banner type="warning" description="This is small. Text may be hard to read. Close this, set 1600 px or more (PNG for text) and run again; your files are still selected." />}
      <Text type="supporting" color="secondary">{it.name}{it.dims ? ' · ' + it.dims + ' px' : ''}{it.before ?` · ${kbs(it.before)} → ${kbs(it.after)}` : ''}</Text>
    </VStack>
  );
}

// Matrix of ready downloads: rows are watermark / size, columns are format or strength. Each file is built when clicked, then kept.
function Downloads({result}) {
  const {rows, cols} = matrix(result.task, result.opts);
  const cache = useRef(new Map());
  const [busy, setBusy] = useState(''), [sizes, setSizes] = useState({}), [err, setErr] = useState('');
  const go = async (row, col) => {
    const key = row.id + '/' + col.id; setErr('');
    let v = cache.current.get(key);
    if (!v) {
      setBusy(key);
      try { v = await buildVariant(result.task, result.files, result.opts, row, col, () => {}); cache.current.set(key, v); setSizes((s) => ({...s, [key]: v.blob.size})); }
      catch (e) { setErr(friendly(e)); setBusy(''); return; }
      setBusy('');
    }
    save(v.blob, v.name);
  };
  return (
    <VStack gap={2} className="matrix-wrap">
      <Text weight="semibold">More ways to download</Text>
      <div className="matrix" role="group" aria-label="Download options" style={{gridTemplateColumns: `minmax(120px, 1.3fr) repeat(${cols.length}, minmax(0, 1fr))`}}>
        <span />
        {cols.map((c) => <span key={c.id} className="mx-h">{c.label}</span>)}
        {rows.map((r) => [
          <span key={r.id} className="mx-r">{r.label}</span>,
          ...cols.map((c) => { const k = r.id + '/' + c.id; return (
            <button type="button" key={k} className="mx-cell" aria-label={`Download ${r.label}, ${c.label}`} disabled={!!busy} onClick={() => go(r, c)}>
              {busy === k ? 'Building…' : <>Download{sizes[k] ? <small>{kbs(sizes[k])}</small> : null}</>}
            </button>); }),
        ])}
      </div>
      {err && <Text color="warning">{err}</Text>}
    </VStack>
  );
}

const ICONS = {photo: PhotoIcon, editor: PaintBrushIcon, merge: DocumentDuplicateIcon, shrink: ArrowsPointingInIcon, mark: PencilSquareIcon};
const RESOURCES = [['Source', 'https://github.com/flisk-sh/studio'], ['Flisk', 'https://flisk.si/'], ['Report a problem', 'https://github.com/flisk-sh/studio/issues']];

const startTask = () => { const h = location.hash.slice(1); return ['photo', 'editor', 'merge', 'shrink', 'mark'].includes(h) ? h : 'photo'; };

export default function App() {
  const unlocked = unlockedAtLoad;
  const [task, setTask] = useState(startTask);
  const mode = task === 'photo' ? 'photo' : 'pdf', action = task;
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [result, setResult] = useState(null);
  const [size, setSize] = useState(1200);
  const [square, setSquare] = useState('fit');
  const [format, setFormat] = useState('jpg');
  const [quality, setQuality] = useState(() => startTask() === 'shrink' ? 60 : 82);
  const [mark, setMark] = useState('');

  // Picking again adds to the list (it no longer replaces it), skipping a file that is already there.
  const onFiles = (v) => setFiles((old) => { const add = (v ? [].concat(v) : []).filter((f) => !old.some((o) => o.name === f.name && o.size === f.size && o.lastModified === f.lastModified)); return old.concat(add); });
  const removeAt = (i) => setFiles((old) => old.filter((_, j) => j !== i));
  const moveAt = (i, d) => setFiles((old) => { const n = old.slice(); const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const pick = (t) => { setTask(t); setFiles([]); setLog(''); setResult(null); setQuality(t === 'shrink' ? 60 : 82); };
  const run = async () => {
    let list = files;
    if (!unlocked && list.length > FREE_FILES) { list = list.slice(0, FREE_FILES); }
    setBusy(true); setLog('Working…');
    try {
      const o = {unlocked, mark: mark.trim(), quality, size, format, square: square === 'square', action};
      const r = mode === 'photo' ? await photoBatch(list, o, setLog) : await pdfBatch(list, o, setLog);
      setResult((old) => { (old && old.items || []).forEach((i) => URL.revokeObjectURL(i.url)); return {...r, task, files: list, opts: o}; });
      setLog(r.msg + (list.length < files.length ? ` Free batch is ${FREE_FILES} files, so the first ${FREE_FILES} were used.` : ''));
    } catch (e) { setLog(friendly(e)); }
    setBusy(false);
  };

  const cur = TASKS.find((t) => t[0] === task);
  return (
    <div className="shell">
      <div className="body">
        <nav className="side" aria-label="Tasks">
          <div className="side-h">Tasks</div>
          {TASKS.map(([id, title]) => { const Ic = ICONS[id]; return (
            <button type="button" key={id} className={'side-item' + (task === id ? ' on' : '')} aria-current={task === id ? 'page' : undefined} onClick={() => pick(id)}>
              <Ic width="18" height="18" /><span>{title}</span>
            </button>); })}
          <div className="side-h">Resources</div>
          {RESOURCES.map(([label, href]) => (
            <a key={label} className="side-item link" href={href} target="_blank" rel="noopener noreferrer"><span>{label}</span><ArrowUpRightIcon width="14" height="14" /></a>
          ))}
        </nav>
        <main className={'content' + (task === 'editor' ? ' wide' : '')}>
          <VStack gap={4}>
            <div className="task-head"><span className="task-copy"><Heading level={2}>{cur[1]}</Heading><Text color="secondary">{cur[2]}</Text></span><Demo kind={task} /></div>
            {task === 'editor' ? <Editor /> : (<>
            <FileInput key={task} label={mode === 'photo' ? 'Photos' : 'PDF files'} isLabelHidden isMultiple mode="dropzone"
              accept={mode === 'photo' ? 'image/*' : 'application/pdf'} value={[]} onChange={onFiles} />
            {files.length > 0 && (
              <VStack gap={2}>
                <HStack gap={2} align="center" justify="space-between">
                  <Text weight="semibold">{files.length} file{files.length > 1 ? 's' : ''} picked{task === 'merge' && files.length > 1 ? ' (merged in this order)' : ''}</Text>
                  <Button label="Clear all" size="sm" variant="ghost" onClick={() => setFiles([])} />
                </HStack>
                <div className="picked-list">{files.map((f, i) => <PickedFile key={f.name + f.size + f.lastModified + i} file={f} index={i} count={files.length} canMove={task === 'merge'} onRemove={removeAt} onMove={moveAt} />)}</div>
              </VStack>
            )}
            {mode === 'photo' ? (
              <section className="inspector" aria-label="Photo settings">
                <div className="inspector-h">Inspector</div>
                <VStack gap={4}>
                  <fieldset className="insp-group"><legend>Size</legend>
                    <VStack gap={3}>
                      <NumberInput label="Size in pixels (longest side, or the square)" value={size} onChange={(v) => v && setSize(v)} />
                      <HStack gap={2} wrap="wrap">{[[500, 'Thumbnail 500'], [1200, 'Web 1200'], [2000, 'Documents 2000']].map(([v, l]) => <Button key={v} label={l} size="sm" variant={size === v ? 'primary' : 'secondary'} onClick={() => setSize(v)} />)}</HStack>
                      {size < 1000 && <Text type="supporting" color="warning">Small size: text in documents, screenshots and photos of paper will be hard to read. Use 1600 px or more, and PNG, for anything with text.</Text>}
                      <Choice value={square} set={setSquare} options={[['fit', 'Keep proportions'], ['square', 'Square crop']]} />
                    </VStack>
                  </fieldset>
                  <fieldset className="insp-group"><legend>Format</legend>
                    <VStack gap={3}>
                      <Choice value={format} set={setFormat} options={[['jpg', 'JPEG (smaller)'], ['png', 'PNG (sharp text)'], ['webp', 'WebP (smallest)']]} />
                      <HStack gap={3} align="center">
                        <div className="insp-slider"><Slider label="JPEG quality slider" isLabelHidden min={30} max={100} value={quality} onChange={(v) => setQuality(v)} valueDisplay="none" /></div>
                        <div className="insp-num"><NumberInput label="JPEG quality, %" value={quality} onChange={(v) => v && setQuality(Math.min(100, Math.max(30, v)))} /></div>
                      </HStack>
                    </VStack>
                  </fieldset>
                  <fieldset className="insp-group"><legend>Mark</legend>
                    <TextInput label="Watermark text (optional)" value={mark} onChange={setMark} />
                  </fieldset>
                </VStack>
              </section>
            ) : task === 'shrink' ? (
              <NumberInput label="Shrink quality, %" value={quality} onChange={(v) => v && setQuality(Math.min(95, Math.max(20, v)))} />
            ) : null}
            {mode !== 'photo' && <TextInput label="Watermark text (optional)" value={mark} onChange={setMark} />}
            <Button label={busy ? 'Working…' : 'Process'} variant="primary" size="lg" isDisabled={busy || !files.length} onClick={run} />
            {log && <Text color="secondary">{log}</Text>}
            {result && <Viewer result={result} onClose={() => setResult(null)} />}
            {FREE_FOR_NOW ? <Banner type="info" description="Free for now: no limits, no mark. Your files never leave your computer." /> : unlocked
              ? <Banner type="success" description={<>Unlocked: no limits and no mark. To unlock another browser or device, <a href={`${location.origin}${location.pathname}?unlocked=${UNLOCK_TOKEN}`}>bookmark this link</a>.</>} />
              : <Banner type="info" description={<>Free: {FREE_FILES} files per batch and a small "{MARK}" mark.{PAYMENT_LINK.includes('REPLACE_ME') ? '' : <> <a href={PAYMENT_LINK}>Unlock for good</a>: one payment, no account.</>}</>} />}
            </>)}
          </VStack>
        </main>
      </div>
    </div>
  );
}
