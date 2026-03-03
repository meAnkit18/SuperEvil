import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('superevil', {
    // Agent controls
    startAgent: (goal: string) => ipcRenderer.invoke('agent:start', goal),
    stopAgent: () => ipcRenderer.invoke('agent:stop'),

    // Browser status
    getBrowserStatus: () => ipcRenderer.invoke('agent:browser-status'),

    // Status updates (main → renderer)
    onStatusUpdate: (callback: (status: string) => void) => {
        ipcRenderer.on('agent:status', (_event, status: string) => {
            callback(status);
        });
    },

    // Remove status listener
    removeStatusListener: () => {
        ipcRenderer.removeAllListeners('agent:status');
    },
});
