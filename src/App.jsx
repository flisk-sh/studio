import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {FileInput} from '@astryxdesign/core/FileInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Banner} from '@astryxdesign/core/Banner';
import {PhotoIcon, DocumentDuplicateIcon, ArrowsPointingInIcon, PencilSquareIcon, ArrowUpRightIcon, ChevronDownIcon} from '@heroicons/react/24/outline';
import {Demo} from './Demos.jsx';
import {photoBatch, pdfBatch, initUnlock, FREE_FOR_NOW, FREE_FILES, MARK, PAYMENT_LINK, UNLOCK_TOKEN} from './engine.js';

const TASKS = [
  ['photo', 'Photos', 'Resize, crop square, compress, add a mark, get a ZIP'],
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
const kbs = (n) => (n / 1024).toFixed(0) + ' KB';
function Viewer({result, onClose}) {
  const [open, setOpen] = useState(0);
  const it = result.items[Math.min(open, result.items.length - 1)];
  return (
    <VStack gap={3} className="viewer">
      <HStack gap={2} align="center" wrap="wrap">
        <Button label={'Download ' + result.name} variant="primary" size="md" onClick={() => save(result.blob, result.name)} />
        <Button label="Close" variant="ghost" size="md" onClick={onClose} />
      </HStack>
      {result.items.length > 1 && (
        <div className="thumbs">{result.items.map((x, i) => (
          <button type="button" key={x.url} className={'thumb' + (i === open ? ' on' : '')} onClick={() => setOpen(i)} title={x.name}>
            {x.kind === 'image' ? <img src={x.url} alt={x.name} /> : <span className="pdfchip">{x.name}</span>}
          </button>))}
        </div>)}
      <div className="stage">
        {it.kind === 'image' ? <img src={it.url} alt={it.name} /> : <iframe title={it.name} src={it.url} />}
      </div>
      {it.kind === 'image' && Math.max(...String(it.dims).split(' × ').map(Number)) < 1000 && <Banner type="warning" description="This is small. Text may be hard to read. Close this, set 1600 px or more (PNG for text) and run again; your files are still selected." />}
      <Text type="supporting" color="secondary">{it.name}{it.dims ? ' · ' + it.dims + ' px' : ''}{it.before ?` · ${kbs(it.before)} → ${kbs(it.after)}` : ''}</Text>
    </VStack>
  );
}

const ICONS = {photo: PhotoIcon, merge: DocumentDuplicateIcon, shrink: ArrowsPointingInIcon, mark: PencilSquareIcon};
const RESOURCES = [['Source', 'https://github.com/flisk-sh/studio'], ['Flisk', 'https://flisk.si/'], ['Report a problem', 'https://github.com/flisk-sh/studio/issues']];
const FLISK_SITES = [['Chat', 'https://chat.flisk.si/'], ['Pages', 'https://pages.flisk.si/'], ['Citable', 'https://citable.flisk.si/'], ['Grow', 'https://grow.flisk.si/'], ['Learn', 'https://learn.flisk.si/']];

// "from Flisk" menu: the Flisk sites, in the header, as in the merged-header design.
function FromFlisk() {
  const [open, setOpen] = useState(false);
  return (
    <span className="from" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      from <button type="button" className="from-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>Flisk <ChevronDownIcon width="12" height="12" /></button>
      {open && <div className="from-menu" role="menu">
        <a role="menuitem" href="https://flisk.si/">All Flisk tools</a>
        {FLISK_SITES.map(([l, h]) => <a role="menuitem" key={l} href={h}>{l}</a>)}
      </div>}
    </span>
  );
}

export default function App() {
  const unlocked = unlockedAtLoad;
  const [task, setTask] = useState('photo');
  const mode = task === 'photo' ? 'photo' : 'pdf', action = task;
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [result, setResult] = useState(null);
  const [size, setSize] = useState(1200);
  const [square, setSquare] = useState('fit');
  const [format, setFormat] = useState('jpg');
  const [quality, setQuality] = useState(82);
  const [mark, setMark] = useState('');

  const onFiles = (v) => setFiles(v ? [].concat(v) : []);
  const pick = (t) => { setTask(t); setFiles([]); setLog(''); setResult(null); if (t === 'shrink' && quality > 95) setQuality(60); };
  const run = async () => {
    let list = files;
    if (!unlocked && list.length > FREE_FILES) { list = list.slice(0, FREE_FILES); }
    setBusy(true); setLog('Working…');
    try {
      const o = {unlocked, mark: mark.trim(), quality, size, format, square: square === 'square', action};
      const r = mode === 'photo' ? await photoBatch(list, o, setLog) : await pdfBatch(list, o, setLog);
      setResult((old) => { (old && old.items || []).forEach((i) => URL.revokeObjectURL(i.url)); return r; });
      setLog(r.msg + (list.length < files.length ? ` Free batch is ${FREE_FILES} files, so the first ${FREE_FILES} were used.` : ''));
    } catch (e) { setLog(friendly(e)); }
    setBusy(false);
  };

  const cur = TASKS.find((t) => t[0] === task);
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true"><PhotoIcon width="22" height="22" /></span>
          <div className="brandtext">
            <Heading level={1}>Studio</Heading>
            <FromFlisk />
          </div>
        </div>
        <Text color="secondary" className="tag">Photos and PDFs, processed in your browser. Nothing is uploaded.</Text>
      </header>
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
        <main className="content">
          <VStack gap={4}>
            <div className="task-head"><span className="task-copy"><Heading level={2}>{cur[1]}</Heading><Text color="secondary">{cur[2]}</Text></span><Demo kind={task} /></div>
            <FileInput key={task} label={mode === 'photo' ? 'Photos' : 'PDF files'} isLabelHidden isMultiple mode="dropzone"
              accept={mode === 'photo' ? 'image/*' : 'application/pdf'} value={files} onChange={onFiles} />
            {mode === 'photo' ? (
              <VStack gap={3}>
                <NumberInput label="Size in pixels (longest side, or the square)" value={size} onChange={(v) => v && setSize(v)} />
                <HStack gap={2} wrap="wrap">{[[500, 'Thumbnail 500'], [1200, 'Web 1200'], [2000, 'Documents 2000']].map(([v, l]) => <Button key={v} label={l} size="sm" variant={size === v ? 'primary' : 'secondary'} onClick={() => setSize(v)} />)}</HStack>
                {size < 1000 && <Text type="supporting" color="warning">Small size: text in documents, screenshots and photos of paper will be hard to read. Use 1600 px or more, and PNG, for anything with text.</Text>}
                <Choice value={square} set={setSquare} options={[['fit', 'Keep proportions'], ['square', 'Square crop']]} />
                <Choice value={format} set={setFormat} options={[['jpg', 'JPEG (smaller)'], ['png', 'PNG (sharp text)']]} />
                <NumberInput label="JPEG quality, %" value={quality} onChange={(v) => v && setQuality(Math.min(100, Math.max(30, v)))} />
              </VStack>
            ) : task === 'shrink' ? (
              <NumberInput label="Shrink quality, %" value={quality} onChange={(v) => v && setQuality(Math.min(95, Math.max(20, v)))} />
            ) : null}
            <TextInput label="Watermark text (optional)" value={mark} onChange={setMark} />
            <Button label={busy ? 'Working…' : 'Process'} variant="primary" size="lg" isDisabled={busy || !files.length} onClick={run} />
            {log && <Text color="secondary">{log}</Text>}
            {result && <Viewer result={result} onClose={() => setResult(null)} />}
            {FREE_FOR_NOW ? <Banner type="info" description="Free for now: no limits, no mark. Your files never leave your computer." /> : unlocked
              ? <Banner type="success" description={<>Unlocked: no limits and no mark. To unlock another browser or device, <a href={`${location.origin}${location.pathname}?unlocked=${UNLOCK_TOKEN}`}>bookmark this link</a>.</>} />
              : <Banner type="info" description={<>Free: {FREE_FILES} files per batch and a small "{MARK}" mark.{PAYMENT_LINK.includes('REPLACE_ME') ? '' : <> <a href={PAYMENT_LINK}>Unlock for good</a>: one payment, no account.</>}</>} />}
          </VStack>
        </main>
      </div>
    </div>
  );
}
