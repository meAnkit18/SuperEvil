// ─── Agent State Machine ────────────────────────────────────
// Strict state machine with validated transitions and full
// transition logging. Every action updates state — no direct jumps.
// ─────────────────────────────────────────────────────────────

export enum AgentState {
    IDLE = 'IDLE',
    INITIALIZING = 'INITIALIZING',
    NAVIGATING = 'NAVIGATING',
    ANALYZING_PAGE = 'ANALYZING_PAGE',
    AUTHENTICATING = 'AUTHENTICATING',
    EXECUTING_TASK = 'EXECUTING_TASK',
    RECOVERY_MODE = 'RECOVERY_MODE',
    BLOCKED = 'BLOCKED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

// ─── Transition Log Entry ───────────────────────────────────

export interface StateTransitionLog {
    from: AgentState;
    to: AgentState;
    timestamp: number;   // epoch ms
    reason?: string;     // human-readable context
}

// ─── Allowed Transitions Map ────────────────────────────────
// Each key maps to the set of states it is allowed to move to.

const TRANSITION_MAP: Record<AgentState, AgentState[]> = {
    [AgentState.IDLE]: [AgentState.INITIALIZING, AgentState.FAILED],
    [AgentState.INITIALIZING]: [AgentState.NAVIGATING, AgentState.FAILED],
    [AgentState.NAVIGATING]: [AgentState.ANALYZING_PAGE, AgentState.AUTHENTICATING, AgentState.RECOVERY_MODE, AgentState.FAILED],
    [AgentState.ANALYZING_PAGE]: [AgentState.EXECUTING_TASK, AgentState.NAVIGATING, AgentState.AUTHENTICATING, AgentState.BLOCKED, AgentState.RECOVERY_MODE, AgentState.FAILED],
    [AgentState.AUTHENTICATING]: [AgentState.NAVIGATING, AgentState.ANALYZING_PAGE, AgentState.BLOCKED, AgentState.RECOVERY_MODE, AgentState.FAILED],
    [AgentState.EXECUTING_TASK]: [AgentState.ANALYZING_PAGE, AgentState.NAVIGATING, AgentState.COMPLETED, AgentState.RECOVERY_MODE, AgentState.FAILED],
    [AgentState.RECOVERY_MODE]: [AgentState.NAVIGATING, AgentState.ANALYZING_PAGE, AgentState.FAILED],
    [AgentState.BLOCKED]: [AgentState.ANALYZING_PAGE, AgentState.RECOVERY_MODE, AgentState.FAILED],
    [AgentState.COMPLETED]: [AgentState.IDLE],
    [AgentState.FAILED]: [AgentState.IDLE],
};

// ─── State Machine Class ────────────────────────────────────

export class StateMachine {
    private _current: AgentState;
    private _history: StateTransitionLog[] = [];

    constructor(initial: AgentState = AgentState.IDLE) {
        this._current = initial;
        console.log(`[StateMachine] Initialized in state: ${initial}`);
    }

    // ── Current state ───────────────────────────────────────

    get current(): AgentState {
        return this._current;
    }

    // ── Full transition history ─────────────────────────────

    get history(): ReadonlyArray<StateTransitionLog> {
        return this._history;
    }

    // ── Check without side effects ──────────────────────────

    canTransition(to: AgentState): boolean {
        const allowed = TRANSITION_MAP[this._current];
        return allowed.includes(to);
    }

    // ── Perform a validated transition ──────────────────────

    transition(to: AgentState, reason?: string): void {
        if (this._current === to) {
            console.warn(`[StateMachine] No-op: already in state ${to}`);
            return;
        }

        if (!this.canTransition(to)) {
            const msg =
                `[StateMachine] ILLEGAL transition: ${this._current} → ${to}` +
                (reason ? ` (reason: ${reason})` : '');
            console.error(msg);
            throw new Error(msg);
        }

        const entry: StateTransitionLog = {
            from: this._current,
            to,
            timestamp: Date.now(),
            reason,
        };

        this._history.push(entry);

        console.log(
            `[StateMachine] ${this._current} → ${to}` +
            (reason ? ` | ${reason}` : ''),
        );

        this._current = to;
    }

    // ── Serialise history for IPC ───────────────────────────

    getTransitionLogs(): StateTransitionLog[] {
        return [...this._history];
    }
}
