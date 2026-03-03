// ─── Session Info (mirrors main/session/types.ts) ───────────
export interface SessionInfo {
    id: string;
    state: string;
    goal: string;
    actionCount: number;
    actions: Array<{
        id: string;
        timestamp: number;
        type: string;
        detail: string;
        success: boolean;
        error?: string;
    }>;
    createdAt: string;
    updatedAt: string;
    browserConnected: boolean;
}

// ─── IPC Bridge Type ────────────────────────────────────────
export interface SuperEvilAPI {
    startAgent: (goal: string) => Promise<{ status: string; goal?: string; sessionId?: string; message?: string }>;
    stopAgent: () => Promise<{ status: string; message?: string }>;
    getBrowserStatus: () => Promise<{ running: boolean }>;
    getSessionInfo: () => Promise<SessionInfo | null>;
    onStatusUpdate: (callback: (status: string) => void) => void;
    removeStatusListener: () => void;
}

declare global {
    interface Window {
        superevil: SuperEvilAPI;
    }
}
