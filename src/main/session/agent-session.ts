import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { AgentState } from './state-machine';
import { StateMachine } from './state-machine';
import { ActionRecord, SessionInfo } from './types';
import { extractPageState, PageState } from '../perception';

type StatusCallback = (message: string) => void;

let idCounter = 0;
function generateId(): string {
    idCounter += 1;
    const ts = Date.now().toString(36);
    const seq = idCounter.toString(36).padStart(4, '0');
    return `session_${ts}_${seq}`;
}

function actionId(): string {
    return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── AgentSession ───────────────────────────────────────────
// One goal = one controlled browser session.
// Encapsulates browser lifecycle, state tracking, and action history.
// Uses a strict StateMachine — every action updates state,
// no direct jumps allowed.
// ─────────────────────────────────────────────────────────────

export class AgentSession {
    readonly id: string;
    readonly goal: string;
    readonly createdAt: Date;

    private _sm: StateMachine;
    private _updatedAt: Date;
    private _browser: Browser | null = null;
    private _context: BrowserContext | null = null;
    private _page: Page | null = null;
    private _actionHistory: ActionRecord[] = [];
    private _onStatus: StatusCallback;

    constructor(goal: string, onStatus: StatusCallback) {
        this.id = generateId();
        this.goal = goal;
        this.createdAt = new Date();
        this._updatedAt = new Date();
        this._onStatus = onStatus;
        this._sm = new StateMachine(AgentState.IDLE);
    }

    // ── Getters ──────────────────────────────────────────────

    get state(): AgentState {
        return this._sm.current;
    }

    get browser(): Browser | null {
        return this._browser;
    }

    get page(): Page | null {
        return this._page;
    }

    get context(): BrowserContext | null {
        return this._context;
    }

    get actionHistory(): ReadonlyArray<ActionRecord> {
        return this._actionHistory;
    }

    get stateMachine(): StateMachine {
        return this._sm;
    }

    // ── State Helper ────────────────────────────────────────

    private transitionTo(next: AgentState, reason?: string): void {
        this._sm.transition(next, reason);
        this._updatedAt = new Date();
    }

    // ── Browser Lifecycle ────────────────────────────────────

    async start(): Promise<void> {
        if (this._browser) {
            this._onStatus('⚠️ Browser is already running for this session');
            return;
        }

        this.transitionTo(AgentState.INITIALIZING, 'Starting browser launch');
        this._onStatus(`🔄 Session ${this.id} — Launching Chromium...`);

        try {
            this._browser = await chromium.launch({
                headless: false,
                args: [
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',
                ],
            });

            this._context = await this._browser.newContext({
                viewport: null,
                ignoreHTTPSErrors: true,
            });

            this._page = await this._context.newPage();

            this.transitionTo(AgentState.NAVIGATING, 'Navigating to initial page');
            await this._page.goto('https://www.google.com');

            this._onStatus(`✅ Session ${this.id} — Chromium launched`);
            this._onStatus(`🌐 Navigated to: ${this._page.url()}`);

            this.recordAction('navigate', 'Opened https://www.google.com', true);

            // Handle external browser close (user closes Chromium window)
            this._browser.on('disconnected', () => {
                this._onStatus(`🔌 Session ${this.id} — Browser disconnected`);
                this._browser = null;
                this._context = null;
                this._page = null;
                if (
                    this._sm.current !== AgentState.COMPLETED &&
                    this._sm.current !== AgentState.FAILED
                ) {
                    try {
                        this.transitionTo(AgentState.FAILED, 'Browser disconnected unexpectedly');
                    } catch {
                        // If already in a terminal state, ignore
                    }
                }
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this._onStatus(`❌ Session ${this.id} — Launch failed: ${message}`);
            this._browser = null;
            this._context = null;
            this._page = null;
            try {
                this.transitionTo(AgentState.FAILED, `Launch error: ${message}`);
            } catch {
                // Already failed or in incompatible state
            }
            throw err;
        }
    }

    async stop(): Promise<void> {
        if (!this._browser) {
            this._onStatus(`⚠️ Session ${this.id} — No browser to close`);
            // Transition to COMPLETED via valid path if possible
            if (this._sm.canTransition(AgentState.COMPLETED)) {
                this.transitionTo(AgentState.COMPLETED, 'Session stopped (no browser)');
            } else if (this._sm.canTransition(AgentState.FAILED)) {
                this.transitionTo(AgentState.FAILED, 'Session stopped (no browser)');
            }
            return;
        }

        this._onStatus(`🔄 Session ${this.id} — Closing Chromium...`);

        try {
            await this._browser.close();
            this._onStatus(`✅ Session ${this.id} — Browser closed`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this._onStatus(`⚠️ Session ${this.id} — Error closing: ${message}`);
        } finally {
            this._browser = null;
            this._context = null;
            this._page = null;
            // Transition to COMPLETED or FAILED depending on available paths
            if (this._sm.canTransition(AgentState.COMPLETED)) {
                this.transitionTo(AgentState.COMPLETED, 'Session stopped');
            } else if (this._sm.canTransition(AgentState.FAILED)) {
                this.transitionTo(AgentState.FAILED, 'Session stopped');
            }
        }
    }

    // ── Action History ───────────────────────────────────────

    recordAction(type: string, detail: string, success: boolean, error?: string): void {
        this._actionHistory.push({
            id: actionId(),
            timestamp: Date.now(),
            type,
            detail,
            success,
            error,
        });
        this._updatedAt = new Date();
    }

    // ── Serializable Snapshot ────────────────────────────────

    getInfo(): SessionInfo {
        return {
            id: this.id,
            state: this._sm.current,
            goal: this.goal,
            actionCount: this._actionHistory.length,
            actions: [...this._actionHistory],
            stateHistory: this._sm.getTransitionLogs(),
            createdAt: this.createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            browserConnected: this._browser !== null && this._browser.isConnected(),
        };
    }

    // ── Query Helpers ────────────────────────────────────────

    isRunning(): boolean {
        return this._browser !== null && this._browser.isConnected();
    }

    isActive(): boolean {
        const activeStates: AgentState[] = [
            AgentState.INITIALIZING,
            AgentState.NAVIGATING,
            AgentState.ANALYZING_PAGE,
            AgentState.AUTHENTICATING,
            AgentState.EXECUTING_TASK,
            AgentState.RECOVERY_MODE,
            AgentState.BLOCKED,
        ];
        return activeStates.includes(this._sm.current);
    }

    // ── Perception ───────────────────────────────────────────

    async analyzePage(): Promise<PageState> {
        if (!this._page) {
            throw new Error(`Session ${this.id} — No page available for analysis`);
        }

        this.transitionTo(AgentState.ANALYZING_PAGE, 'Extracting page state');
        this._onStatus(`🔍 Session ${this.id} — Analyzing page...`);

        try {
            const state = await extractPageState(this._page);

            this.recordAction(
                'analyze',
                `Extracted page state: ${state.url} — ${state.buttons.length} buttons, ${state.inputs.length} inputs, ${state.links.length} links`,
                true,
            );

            this._onStatus(
                `✅ Session ${this.id} — Page analyzed: ${state.buttons.length} buttons, ` +
                `${state.inputs.length} inputs, ${state.links.length} links`,
            );

            return state;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.recordAction('analyze', `Failed to extract page state`, false, message);
            this._onStatus(`❌ Session ${this.id} — Page analysis failed: ${message}`);
            throw err;
        }
    }
}
