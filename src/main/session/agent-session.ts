import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SessionState, ActionRecord, SessionInfo } from './types';

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
// ─────────────────────────────────────────────────────────────

export class AgentSession {
    readonly id: string;
    readonly goal: string;
    readonly createdAt: Date;

    private _state: SessionState = SessionState.Idle;
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
    }

    // ── Getters ──────────────────────────────────────────────

    get state(): SessionState {
        return this._state;
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

    // ── State Transitions ────────────────────────────────────

    private setState(next: SessionState): void {
        this._state = next;
        this._updatedAt = new Date();
    }

    // ── Browser Lifecycle ────────────────────────────────────

    async start(): Promise<void> {
        if (this._browser) {
            this._onStatus('⚠️ Browser is already running for this session');
            return;
        }

        this.setState(SessionState.Launching);
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
            await this._page.goto('https://www.google.com');

            this.setState(SessionState.Running);
            this._onStatus(`✅ Session ${this.id} — Chromium launched`);
            this._onStatus(`🌐 Navigated to: ${this._page.url()}`);

            this.recordAction('navigate', 'Opened https://www.google.com', true);

            // Handle external browser close (user closes Chromium window)
            this._browser.on('disconnected', () => {
                this._onStatus(`🔌 Session ${this.id} — Browser disconnected`);
                this._browser = null;
                this._context = null;
                this._page = null;
                if (this._state === SessionState.Running) {
                    this.setState(SessionState.Stopped);
                }
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this._onStatus(`❌ Session ${this.id} — Launch failed: ${message}`);
            this._browser = null;
            this._context = null;
            this._page = null;
            this.setState(SessionState.Failed);
            throw err;
        }
    }

    async stop(): Promise<void> {
        if (!this._browser) {
            this._onStatus(`⚠️ Session ${this.id} — No browser to close`);
            this.setState(SessionState.Stopped);
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
            this.setState(SessionState.Stopped);
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
            state: this._state,
            goal: this.goal,
            actionCount: this._actionHistory.length,
            actions: [...this._actionHistory],
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
        return this._state === SessionState.Running || this._state === SessionState.Launching;
    }
}
