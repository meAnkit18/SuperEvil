// ─── Action Executor ────────────────────────────────────────
// Maps structured AgentAction objects to Playwright Page calls.
// Each handler runs the Playwright method, then waits for
// network + DOM stability before returning.
// ─────────────────────────────────────────────────────────────

import { Page } from 'playwright';
import {
    AgentAction,
    ActionResult,
    ClickAction,
    FillAction,
    TypeAction,
    PressAction,
    NavigateAction,
    ScrollAction,
    SelectAction,
    HoverAction,
    WaitAction,
} from './types';
import { waitAfterAction } from './wait-helpers';

// ── Constants ───────────────────────────────────────────────

const DEFAULT_ACTION_TIMEOUT = 10_000;    // ms per Playwright call
const DEFAULT_SCROLL_AMOUNT = 300;       // px

type StatusCallback = (message: string) => void;

// ─── ActionExecutor ─────────────────────────────────────────

export class ActionExecutor {
    private readonly _page: Page;
    private readonly _onStatus: StatusCallback;

    constructor(page: Page, onStatus?: StatusCallback) {
        this._page = page;
        this._onStatus = onStatus ?? (() => { });
    }

    // ── Main Entry Point ────────────────────────────────────

    async execute(action: AgentAction): Promise<ActionResult> {
        const start = Date.now();
        const detail = describeAction(action);

        this._onStatus(`⚡ Executing: ${detail}`);

        try {
            await this.dispatch(action);

            // Post-action wait (network idle + DOM stable)
            if (action.type !== 'wait') {
                await waitAfterAction(this._page);
            }

            const durationMs = Date.now() - start;
            this._onStatus(`✅ Done (${durationMs}ms): ${detail}`);

            return {
                success: true,
                durationMs,
                actionType: action.type,
                detail,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const durationMs = Date.now() - start;
            this._onStatus(`❌ Failed (${durationMs}ms): ${detail} — ${message}`);

            return {
                success: false,
                error: message,
                durationMs,
                actionType: action.type,
                detail,
            };
        }
    }

    // ── Dispatcher ──────────────────────────────────────────

    private async dispatch(action: AgentAction): Promise<void> {
        switch (action.type) {
            case 'click': return this.handleClick(action);
            case 'fill': return this.handleFill(action);
            case 'type': return this.handleType(action);
            case 'press': return this.handlePress(action);
            case 'navigate': return this.handleNavigate(action);
            case 'scroll': return this.handleScroll(action);
            case 'select': return this.handleSelect(action);
            case 'hover': return this.handleHover(action);
            case 'wait': return this.handleWait(action);
            default:
                throw new Error(`Unknown action type: ${(action as any).type}`);
        }
    }

    // ── Individual Handlers ─────────────────────────────────

    private async handleClick(action: ClickAction): Promise<void> {
        await this._page.click(action.selector, {
            timeout: DEFAULT_ACTION_TIMEOUT,
        });
    }

    private async handleFill(action: FillAction): Promise<void> {
        // click first to focus, then fill — more reliable than fill alone
        await this._page.click(action.selector, {
            timeout: DEFAULT_ACTION_TIMEOUT,
        });
        await this._page.fill(action.selector, action.value, {
            timeout: DEFAULT_ACTION_TIMEOUT,
        });
    }

    private async handleType(action: TypeAction): Promise<void> {
        await this._page.keyboard.type(action.text, { delay: 50 });
    }

    private async handlePress(action: PressAction): Promise<void> {
        await this._page.keyboard.press(action.key);
    }

    private async handleNavigate(action: NavigateAction): Promise<void> {
        await this._page.goto(action.url, {
            timeout: DEFAULT_ACTION_TIMEOUT * 3,   // navigation can be slow
            waitUntil: 'domcontentloaded',
        });
    }

    private async handleScroll(action: ScrollAction): Promise<void> {
        const amount = action.amount ?? DEFAULT_SCROLL_AMOUNT;

        let deltaX = 0;
        let deltaY = 0;

        switch (action.direction) {
            case 'down': deltaY = amount; break;
            case 'up': deltaY = -amount; break;
            case 'right': deltaX = amount; break;
            case 'left': deltaX = -amount; break;
        }

        await this._page.mouse.wheel(deltaX, deltaY);
    }

    private async handleSelect(action: SelectAction): Promise<void> {
        await this._page.selectOption(action.selector, action.value, {
            timeout: DEFAULT_ACTION_TIMEOUT,
        });
    }

    private async handleHover(action: HoverAction): Promise<void> {
        await this._page.hover(action.selector, {
            timeout: DEFAULT_ACTION_TIMEOUT,
        });
    }

    private async handleWait(action: WaitAction): Promise<void> {
        await this._page.waitForTimeout(action.duration);
    }
}

// ── Helper: Human-Readable Description ──────────────────────

function describeAction(action: AgentAction): string {
    switch (action.type) {
        case 'click': return `click → "${action.selector}"`;
        case 'fill': return `fill → "${action.selector}" with "${action.value}"`;
        case 'type': return `type → "${action.text}"`;
        case 'press': return `press → ${action.key}`;
        case 'navigate': return `navigate → ${action.url}`;
        case 'scroll': return `scroll ${action.direction} ${action.amount ?? DEFAULT_SCROLL_AMOUNT}px`;
        case 'select': return `select → "${action.selector}" = "${action.value}"`;
        case 'hover': return `hover → "${action.selector}"`;
        case 'wait': return `wait ${action.duration}ms`;
        default: return `unknown action`;
    }
}
