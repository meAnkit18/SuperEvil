import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from './session';

// ─── Load .env ──────────────────────────────────────────────
// Simple .env loader — avoids adding dotenv as a dependency.
(function loadEnv() {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
        console.log('[SuperEvil] .env loaded');
    } else {
        console.warn('[SuperEvil] No .env file found at', envPath);
    }
})();

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;

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

    // Initialize session manager
    sessionManager = new SessionManager();

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Clean up session manager when the control panel is closed
        if (sessionManager) {
            sessionManager.destroy();
        }
        sessionManager = null;
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

    if (!sessionManager) {
        sendStatus('❌ Session manager not initialized');
        return { status: 'error', message: 'Session manager not initialized' };
    }

    try {
        const session = await sessionManager.createSession(goal, sendStatus);
        return { status: 'started', goal, sessionId: session.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'error', message };
    }
});

ipcMain.handle('agent:stop', async () => {
    console.log('[SuperEvil] Agent stopped');

    if (!sessionManager) {
        return { status: 'error', message: 'Session manager not initialized' };
    }

    try {
        await sessionManager.stopSession();
        return { status: 'stopped' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'error', message };
    }
});

ipcMain.handle('agent:browser-status', async () => {
    return {
        running: sessionManager?.hasActiveSession() ?? false,
    };
});

ipcMain.handle('agent:session-info', async () => {
    if (!sessionManager) {
        return null;
    }
    return sessionManager.getSessionInfo();
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
