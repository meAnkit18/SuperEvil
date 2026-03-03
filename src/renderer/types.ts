// Type declarations for the SuperEvil IPC bridge
export interface SuperEvilAPI {
    startAgent: (goal: string) => Promise<{ status: string; goal?: string }>;
    stopAgent: () => Promise<{ status: string }>;
    navigateBrowser: (url: string) => Promise<{ status: string; url?: string; message?: string }>;
    getBrowserUrl: () => Promise<string>;
    onStatusUpdate: (callback: (status: string) => void) => void;
    removeStatusListener: () => void;
}

declare global {
    interface Window {
        superevil: SuperEvilAPI;
    }
}
