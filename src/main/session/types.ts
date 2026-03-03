// ─── Action History ─────────────────────────────────────────
export interface ActionRecord {
    id: string;
    timestamp: number;
    type: string;          // e.g. 'navigate', 'click', 'type', 'scroll'
    detail: string;        // human-readable description
    success: boolean;
    error?: string;
}

// Re-export state types from the state machine module
export { AgentState, type StateTransitionLog } from './state-machine';

// ─── Serializable Session Snapshot (for IPC) ────────────────
export interface SessionInfo {
    id: string;
    state: string;
    goal: string;
    actionCount: number;
    actions: ActionRecord[];
    stateHistory: Array<{
        from: string;
        to: string;
        timestamp: number;
        reason?: string;
    }>;
    createdAt: string;     // ISO string
    updatedAt: string;     // ISO string
    browserConnected: boolean;
}
