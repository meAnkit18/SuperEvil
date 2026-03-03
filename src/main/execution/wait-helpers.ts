// ─── Wait Helpers ───────────────────────────────────────────
// Robust wait utilities used after each action execution.
// Never throw — always return gracefully so the agent loop
// is never broken by a wait timeout.
// ─────────────────────────────────────────────────────────────

import { Page } from 'playwright';

// ── Constants ───────────────────────────────────────────────

const DEFAULT_NETWORK_TIMEOUT = 5_000;   // ms
const DEFAULT_DOM_TIMEOUT = 3_000;   // ms
const DOM_POLL_INTERVAL = 200;     // ms
const DOM_STABLE_THRESHOLD = 300;     // ms — how long DOM must be unchanged

// ── Wait for Network Idle ───────────────────────────────────

export async function waitForNetworkIdle(
    page: Page,
    timeout: number = DEFAULT_NETWORK_TIMEOUT,
): Promise<boolean> {
    try {
        await page.waitForLoadState('networkidle', { timeout });
        return true;
    } catch {
        // Timeout is acceptable — the page may have long-polling or SSE
        return false;
    }
}

// ── Wait for DOM Stability ──────────────────────────────────
// Polls document.body.innerHTML length until it stops changing
// for at least DOM_STABLE_THRESHOLD ms, or the timeout expires.

export async function waitForDomStable(
    page: Page,
    timeout: number = DEFAULT_DOM_TIMEOUT,
): Promise<boolean> {
    const start = Date.now();
    let lastLength = -1;
    let lastChangeTime = start;

    while (Date.now() - start < timeout) {
        try {
            const length = await page.evaluate(() => document.body.innerHTML.length);

            if (length !== lastLength) {
                lastLength = length;
                lastChangeTime = Date.now();
            } else if (Date.now() - lastChangeTime >= DOM_STABLE_THRESHOLD) {
                return true;   // DOM has been stable long enough
            }
        } catch {
            // Page may be navigating — ignore evaluation errors
        }

        await page.waitForTimeout(DOM_POLL_INTERVAL);
    }

    return false;  // timed out, but we don't throw
}

// ── Combined Post-Action Wait ───────────────────────────────

export interface WaitSummary {
    networkIdle: boolean;
    domStable: boolean;
}

export async function waitAfterAction(page: Page): Promise<WaitSummary> {
    const [networkIdle, domStable] = await Promise.all([
        waitForNetworkIdle(page),
        waitForDomStable(page),
    ]);

    return { networkIdle, domStable };
}
