import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { PlaywrightService } from './playwright-service';

let mainWindow: BrowserWindow | null = null;
let playwrightService: PlaywrightService | null = null;

const isDev = !app.isPackaged;

function sendStatus(message: string): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent:status', message);
    }
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 720,
        minWidth: 400,
        minHeight: 500,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hiddenInset',
        frame: true,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    // Load the React control panel
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Initialize Playwright service with status callback
    playwrightService = new PlaywrightService(sendStatus);

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Clean up Playwright when the control panel is closed
        if (playwrightService && playwrightService.isRunning()) {
            playwrightService.close();
        }
        playwrightService = null;
    });

    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

// ─── IPC Handlers ───────────────────────────────────────────

ipcMain.handle('agent:start', async (_event, goal: string) => {
    console.log('[SuperEvil] Agent started with goal:', goal);
    sendStatus(`🎯 Goal set: "${goal}"`);

    if (!playwrightService) {
        sendStatus('❌ Playwright service not initialized');
        return { status: 'error', message: 'Service not initialized' };
    }

    try {
        await playwrightService.launch();
        return { status: 'started', goal };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'error', message };
    }
});

ipcMain.handle('agent:stop', async () => {
    console.log('[SuperEvil] Agent stopped');

    if (!playwrightService) {
        return { status: 'error', message: 'Service not initialized' };
    }

    try {
        await playwrightService.close();
        return { status: 'stopped' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'error', message };
    }
});

ipcMain.handle('agent:browser-status', async () => {
    return {
        running: playwrightService?.isRunning() ?? false,
    };
});

// ─── App Lifecycle ──────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
