// ─── Session State Machine ──────────────────────────────────
export enum SessionState {
    Idle = 'idle',
    Launching = 'launching',
    Running = 'running',
    Paused = 'paused',
    Completed = 'completed',
    Failed = 'failed',
    Stopped = 'stopped',
}

// ─── Action History ─────────────────────────────────────────
export interface ActionRecord {
    id: string;
    timestamp: number;
    type: string;          // e.g. 'navigate', 'click', 'type', 'scroll'
    detail: string;        // human-readable description
    success: boolean;
    error?: string;
}

// ─── Serializable Session Snapshot (for IPC) ────────────────
export interface SessionInfo {
    id: string;
    state: SessionState;
    goal: string;
    actionCount: number;
    actions: ActionRecord[];
    createdAt: string;     // ISO string
    updatedAt: string;     // ISO string
    browserConnected: boolean;
}
