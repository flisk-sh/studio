import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './demos.css';
import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from './astryx-themes.js';
import App from './App.jsx';

// Inside chat.flisk.si (?embed=1) the chat decides light or dark: it sends ?mode= in the address and a
// {flisk: 'studio', type: 'mode', mode} message when the person changes the look, so the frame never clashes with the chat.
const MODES = ['light', 'dark', 'system'];
const isChat = (o) => o === 'https://chat.flisk.si' || /^http:\/\/localhost(:\d+)?$/.test(o);
const embedded = new URLSearchParams(location.search).get('embed') === '1';
const first = new URLSearchParams(location.search).get('mode');

function Root() {
  const [mode, setMode] = useState(embedded && MODES.includes(first) ? first : 'system');
  useEffect(() => {
    if (!embedded) return;
    const m = (e) => { if (isChat(e.origin) && e.data && e.data.flisk === 'studio' && e.data.type === 'mode' && MODES.includes(e.data.mode)) setMode(e.data.mode); };
    window.addEventListener('message', m); return () => window.removeEventListener('message', m);
  }, []);
  return <Theme theme={themes[defaultThemeSlug]} mode={mode}><App /></Theme>;
}

createRoot(document.getElementById('root')).render(<Root />);
