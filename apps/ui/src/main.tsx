import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FloatView } from './Float';
import './style.css';
import '@xterm/xterm/css/xterm.css';

const float = new URLSearchParams(location.search).get('view') === 'float';
if (float) document.documentElement.dataset.view = 'float';
// xterm owns a native-like viewport; avoid StrictMode's development-only mount cycle
// in the floating window, which can dispose its dimensions while an output frame is pending.
createRoot(document.getElementById('root')!).render(float ? <FloatView /> : <React.StrictMode><App /></React.StrictMode>);
