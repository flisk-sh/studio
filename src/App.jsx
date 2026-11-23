import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {FileInput} from '@astryxdesign/core/FileInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Banner} from '@astryxdesign/core/Banner';
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

const TaskRow = ({id, title, text, on, pick}) => (
  <button type="button" onClick={() => pick(id)} aria-pressed={on} className={'task-row' + (on ? ' on' : '')}>
    <span className="task-copy"><Text weight="semibold">{title}</Text><Text type="supporting" color="secondary">{text}</Text></span>
    <Demo kind={id} />
  </button>
);

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
      <Text type="supporting" color="secondary">{it.name}{it.dims ? ' · ' + it.dims + ' px' : ''}{it.before ?` · ${kbs(it.before)} → ${kbs(it.after)}` : ''}</Text>
    </VStack>
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
    } catch (e) { setLog('Failed: ' + (e && e.message || e)); }
    setBusy(false);
  };

  return (
    <main style={{maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px'}}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={1}>Local Studio</Heading>
          <Text color="secondary">Photos and PDFs, processed in your browser. Nothing is uploaded.</Text>
        </VStack>
        <VStack gap={2}>{TASKS.map(([id, title, text]) => <TaskRow key={id} id={id} title={title} text={text} on={task === id} pick={pick} />)}</VStack>
        <div className="task-row static"><span className="task-copy"><Text weight="semibold">Add your files</Text><Text type="supporting" color="secondary">They stay on your computer</Text></span><Demo kind="drop" /></div>
        <FileInput key={task} label={mode === 'photo' ? 'Photos' : 'PDF files'} isLabelHidden isMultiple mode="dropzone"
          accept={mode === 'photo' ? 'image/*' : 'application/pdf'} value={files} onChange={onFiles} />
        {mode === 'photo' ? (
          <VStack gap={3}>
            <NumberInput label="Size in pixels (longest side, or the square)" value={size} onChange={(v) => v && setSize(v)} />
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
  );
}
