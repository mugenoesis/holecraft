import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '@holecraft/server';
import { BrowserWindow, app, shell } from 'electron';

declare const __HOLECRAFT_VERSION__: string;

type Server = Awaited<ReturnType<typeof createServer>>;

let server: Server | undefined;

function dataDir(): string {
  if (process.env.HOLECRAFT_DATA_DIR) return process.env.HOLECRAFT_DATA_DIR;
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'holecraft');
}

function webDir(): string {
  // Packaged: resources/web (see "extraResources"); dev: the Vite build output.
  return app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../../web/dist');
}

/** Runs the same server as the Docker image, bound to loopback on a free port. */
async function startServer(): Promise<string> {
  server = await createServer({ dataDir: dataDir(), staticDir: webDir(), version: __HOLECRAFT_VERSION__ });
  await server.listen({ host: '127.0.0.1', port: 0 });
  const { port } = server.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function createWindow(origin: string): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Holecraft',
    backgroundColor: '#f4f6f8',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Keep the window on the local app; anything else opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${origin}/`) && url !== origin) event.preventDefault();
  });

  await win.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app
    .whenReady()
    .then(startServer)
    .then(createWindow)
    .catch((err: unknown) => {
      console.error('Holecraft failed to start:', err);
      app.exit(1);
    });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    void server?.close();
  });
}
