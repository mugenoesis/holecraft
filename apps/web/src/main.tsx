import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { installErrorLog } from './errorLog.ts';
import './styles.css';

installErrorLog(window);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
