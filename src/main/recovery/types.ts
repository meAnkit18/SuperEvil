// ─── Recovery Engine Types ──────────────────────────────────
// Types for the recovery system that prevents the agent from
// freezing when stuck.
// ─────────────────────────────────────────────────────────────

// ── Triggers: Why recovery was invoked ──────────────────────

export type RecoveryTrigger =
    | 'no_dom_change'          // page didn't change after action
    | 'same_state_repeated'    // same URL+title keeps appearing
    | 'action_failed';         // action execution returned success=false

// ── Strategies: Ordered escalation steps ────────────────────

export type RecoveryStrategy =
    | 'scroll'                 // scroll to reveal hidden elements
    | 'rescan'                 // re-extract page state
    | 'alternate_selector'     // try text-based fallback selector
    | 'refresh'                // page.reload()
    | 'replan';                // signal caller to run full re-plan

// ── Recovery attempt result ─────────────────────────────────

export interface RecoveryResult {
    recovered: boolean;
    strategy: RecoveryStrategy;
    detail: string;
    attemptNumber: number;     // which strategy # in the escalation
}

// ── Configuration ───────────────────────────────────────────

export interface RecoveryConfig {
    maxConsecutiveFailures: number;   // BLOCKED after this many (default 5)
    domChangeThreshold: number;       // min innerHTML length diff (default 50)
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
    maxConsecutiveFailures: 5,
    domChangeThreshold: 50,
};

// ── Strategy execution order ────────────────────────────────

export const RECOVERY_STRATEGY_ORDER: RecoveryStrategy[] = [
    'scroll',
    'rescan',
    'alternate_selector',
    'refresh',
    'replan',
];
