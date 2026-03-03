// ─── Recovery Engine ────────────────────────────────────────
// When the agent gets stuck, the recovery engine fires an
// ordered escalation of strategies to get unstuck.
//
// Trigger detection:
//   1. No DOM change after action
//   2. Same page state repeated in recent history
//   3. Action execution failed
//
// Escalation order:
//   scroll → re-scan → alternate selector → refresh → re-plan
//
// After maxConsecutiveFailures → caller should transition to BLOCKED.
// ─────────────────────────────────────────────────────────────

import { Page } from 'playwright';
import {
    RecoveryTrigger,
    RecoveryStrategy,
    RecoveryResult,
    RecoveryConfig,
    DEFAULT_RECOVERY_CONFIG,
    RECOVERY_STRATEGY_ORDER,
} from './types';
import { PageState } from '../perception';
import { ActionRecord } from '../session/types';

export class RecoveryEngine {
    private readonly _config: RecoveryConfig;
    private _consecutiveFailures: number = 0;
    private _lastDomLength: number = -1;

    constructor(config?: Partial<RecoveryConfig>) {
        this._config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    }

    get config(): Readonly<RecoveryConfig> {
        return this._config;
    }

    get consecutiveFailures(): number {
        return this._consecutiveFailures;
    }

    // ── Trigger Detection ───────────────────────────────────
    // Returns the trigger reason, or null if no recovery needed.

    detectTrigger(
        actionSuccess: boolean,
        pageStateBefore: PageState | null,
        pageStateAfter: PageState,
        actionHistory: ActionRecord[],
    ): RecoveryTrigger | null {
        // 1. Action failed outright
        if (!actionSuccess) {
            console.log('[RecoveryEngine] Trigger detected: action_failed');
            return 'action_failed';
        }

        // 2. No DOM change — compare visible text length as proxy
        if (pageStateBefore) {
            const lengthBefore = pageStateBefore.visibleTextSummary.length;
            const lengthAfter = pageStateAfter.visibleTextSummary.length;
            const diff = Math.abs(lengthAfter - lengthBefore);

            if (
                diff < this._config.domChangeThreshold &&
                pageStateBefore.url === pageStateAfter.url
            ) {
                console.log(
                    `[RecoveryEngine] Trigger detected: no_dom_change ` +
                    `(diff=${diff}, threshold=${this._config.domChangeThreshold})`,
                );
                return 'no_dom_change';
            }
        }

        // 3. Same state repeated — same URL+title appearing in last 3 actions
        if (actionHistory.length >= 3) {
            const tail = actionHistory.slice(-3);
            const allSameType = tail.every(r => r.type === tail[0].type);
            const allSameDetail = tail.every(r => r.detail === tail[0].detail);
            if (allSameType && allSameDetail) {
                console.log('[RecoveryEngine] Trigger detected: same_state_repeated');
                return 'same_state_repeated';
            }
        }

        return null;
    }

    // ── Escalation Attempt ──────────────────────────────────
    // Runs the ordered recovery strategies. Returns on the first
    // strategy that produces a DOM change, or after exhausting all.

    async attempt(
        page: Page,
        trigger: RecoveryTrigger,
        failedSelector?: string,
    ): Promise<RecoveryResult> {
        this._consecutiveFailures++;

        console.log(
            `[RecoveryEngine] Starting recovery (trigger: ${trigger}, ` +
            `failure #${this._consecutiveFailures}/${this._config.maxConsecutiveFailures})`,
        );

        // Snapshot DOM before recovery
        const domBefore = await this.getDomLength(page);

        for (let i = 0; i < RECOVERY_STRATEGY_ORDER.length; i++) {
            const strategy = RECOVERY_STRATEGY_ORDER[i];
            console.log(`[RecoveryEngine] Trying strategy ${i + 1}/${RECOVERY_STRATEGY_ORDER.length}: ${strategy}`);

            try {
                const detail = await this.executeStrategy(page, strategy, failedSelector);

                // Check if DOM changed after this strategy
                const domAfter = await this.getDomLength(page);
                const domChanged = Math.abs(domAfter - domBefore) >= this._config.domChangeThreshold;

                if (domChanged || strategy === 'replan') {
                    console.log(
                        `[RecoveryEngine] ✅ Strategy "${strategy}" succeeded` +
                        (domChanged ? ` (DOM changed by ${Math.abs(domAfter - domBefore)} chars)` : ''),
                    );
                    return {
                        recovered: true,
                        strategy,
                        detail,
                        attemptNumber: i + 1,
                    };
                }

                console.log(`[RecoveryEngine] Strategy "${strategy}" did not change DOM, escalating...`);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[RecoveryEngine] Strategy "${strategy}" failed: ${message}`);
            }
        }

        // All strategies exhausted
        console.error('[RecoveryEngine] ❌ All recovery strategies exhausted');
        return {
            recovered: false,
            strategy: 'replan',
            detail: 'All recovery strategies exhausted',
            attemptNumber: RECOVERY_STRATEGY_ORDER.length,
        };
    }

    // ── BLOCKED Check ───────────────────────────────────────

    isBlocked(): boolean {
        return this._consecutiveFailures >= this._config.maxConsecutiveFailures;
    }

    // ── Reset (call on successful action) ───────────────────

    reset(): void {
        if (this._consecutiveFailures > 0) {
            console.log(
                `[RecoveryEngine] Reset — clearing ${this._consecutiveFailures} consecutive failures`,
            );
        }
        this._consecutiveFailures = 0;
    }

    // ── Strategy Execution ──────────────────────────────────

    private async executeStrategy(
        page: Page,
        strategy: RecoveryStrategy,
        failedSelector?: string,
    ): Promise<string> {
        switch (strategy) {
            case 'scroll':
                return this.strategyScroll(page);
            case 'rescan':
                return this.strategyRescan(page);
            case 'alternate_selector':
                return this.strategyAlternateSelector(page, failedSelector);
            case 'refresh':
                return this.strategyRefresh(page);
            case 'replan':
                return this.strategyReplan();
        }
    }

    // ── Strategy 1: Scroll ──────────────────────────────────
    // Scroll down and then up to reveal dynamically-loaded content.

    private async strategyScroll(page: Page): Promise<string> {
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500);
        await page.mouse.wheel(0, -150);
        await page.waitForTimeout(300);
        return 'Scrolled down 300px then up 150px to reveal content';
    }

    // ── Strategy 2: Re-scan ─────────────────────────────────
    // Wait for DOM to stabilize, then signal a re-analysis.

    private async strategyRescan(page: Page): Promise<string> {
        await page.waitForTimeout(1000);
        try {
            await page.waitForLoadState('networkidle', { timeout: 3000 });
        } catch {
            // Network may not go idle — that's fine
        }
        return 'Waited for network idle and DOM stabilization for re-scan';
    }

    // ── Strategy 3: Alternate Selector ──────────────────────
    // If we have the failed selector, try finding the element
    // by visible text instead.

    private async strategyAlternateSelector(
        page: Page,
        failedSelector?: string,
    ): Promise<string> {
        if (!failedSelector) {
            return 'No failed selector provided — skipped alternate selector strategy';
        }

        // Try to find visible text near the failed selector to use as fallback
        try {
            const elementText = await page.evaluate((sel: string) => {
                const el = document.querySelector(sel);
                return el?.textContent?.trim() ?? null;
            }, failedSelector);

            if (elementText) {
                // Try clicking by text as a fallback
                const locator = page.getByText(elementText, { exact: false });
                const count = await locator.count();
                if (count > 0) {
                    await locator.first().scrollIntoViewIfNeeded({ timeout: 2000 });
                    return `Found ${count} element(s) by text "${elementText}" — scrolled into view`;
                }
            }
        } catch {
            // Element might not exist at all
        }

        // Try broader approach: scroll the whole page to trigger lazy loading
        await page.evaluate(() => {
            window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
        });
        await page.waitForTimeout(500);

        return `Attempted alternate selector for "${failedSelector}" — scrolled to mid-page`;
    }

    // ── Strategy 4: Refresh ─────────────────────────────────

    private async strategyRefresh(page: Page): Promise<string> {
        await page.reload({ timeout: 15000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        return 'Page refreshed and DOM content loaded';
    }

    // ── Strategy 5: Re-plan ─────────────────────────────────
    // This is a signal to the caller — no page action taken.

    private async strategyReplan(): Promise<string> {
        return 'Signaling full strategic re-plan — no page action taken';
    }

    // ── DOM Length Helper ────────────────────────────────────

    private async getDomLength(page: Page): Promise<number> {
        try {
            const length = await page.evaluate(() => document.body.innerHTML.length);
            this._lastDomLength = length;
            return length;
        } catch {
            return this._lastDomLength;
        }
    }
}
