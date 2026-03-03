// Type declarations for the SuperEvil IPC bridge
export interface SuperEvilAPI {
    startAgent: (goal: string) => Promise<{ status: string; goal?: string; message?: string }>;
    stopAgent: () => Promise<{ status: string; message?: string }>;
    getBrowserStatus: () => Promise<{ running: boolean }>;
    onStatusUpdate: (callback: (status: string) => void) => void;
    removeStatusListener: () => void;
}

declare global {
    interface Window {
        superevil: SuperEvilAPI;
    }
}
