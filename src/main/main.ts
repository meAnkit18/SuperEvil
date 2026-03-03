import { app, BrowserWindow, BrowserView, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;

const CONTROL_PANEL_WIDTH_RATIO = 0.30;
const isDev = !app.isPackaged;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hiddenInset',
        frame: true,
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

    // Create embedded browser view (right panel)
    browserView = new BrowserView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.setBrowserView(browserView);
    browserView.webContents.loadURL('https://www.google.com');

    // Position the browser view
    positionBrowserView();

    // Re-position on resize
    mainWindow.on('resize', () => {
        positionBrowserView();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        browserView = null;
    });

    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

function positionBrowserView(): void {
    if (!mainWindow || !browserView) return;

    const bounds = mainWindow.getContentBounds();
    const controlPanelWidth = Math.round(bounds.width * CONTROL_PANEL_WIDTH_RATIO);

    browserView.setBounds({
        x: controlPanelWidth,
        y: 0,
        width: bounds.width - controlPanelWidth,
        height: bounds.height,
    });

    browserView.setAutoResize({
        width: true,
        height: true,
        horizontal: false,
        vertical: false,
    });
}

// ─── IPC Handlers ───────────────────────────────────────────

ipcMain.handle('agent:start', async (_event, goal: string) => {
    console.log('[SuperEvil] Agent started with goal:', goal);
    // Agent logic will be wired in Phase 2+
    return { status: 'started', goal };
});

ipcMain.handle('agent:stop', async () => {
    console.log('[SuperEvil] Agent stopped');
    return { status: 'stopped' };
});

ipcMain.handle('browser:navigate', async (_event, url: string) => {
    if (browserView) {
        browserView.webContents.loadURL(url);
        return { status: 'navigated', url };
    }
    return { status: 'error', message: 'No browser view' };
});

ipcMain.handle('browser:get-url', async () => {
    if (browserView) {
        return browserView.webContents.getURL();
    }
    return '';
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
