import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	// Absolute asset paths so deep links (/designs/:id) load correctly. Serving under a
	// reverse-proxy subpath is not supported yet; use a subdomain instead.
	base: '/',
	// The geometry worker is an ES module worker (it imports packages and a .wasm URL).
	worker: { format: 'es' },
	server: {
		port: 5173,
		proxy: { '/api': 'http://127.0.0.1:8080' },
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
		// three.js alone is ~700 kB; the app is served locally, so one chunk is fine for now.
		chunkSizeWarningLimit: 1500,
	},
});
