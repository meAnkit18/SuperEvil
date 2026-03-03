// ─── Critic Layer ───────────────────────────────────────────
// Safety gate that validates every planner-proposed action
// before it reaches the execution engine.
//
// Checks (fail-fast order):
//   1. Target exists     — selector matches something in page state
//   2. Target visible    — matched element is usable (not disabled)
//   3. Not repeated      — same action not repeated > N times
//   4. Confidence ok     — planner confidence ≥ threshold
//
// If any check fails → action is rejected with a reason and
// a shouldReplan hint so the caller can retry appropriately.
// ─────────────────────────────────────────────────────────────

import {
    CriticVerdict,
    CriticConfig,
    CriticCheckName,
    DEFAULT_CRITIC_CONFIG,
} from './types';
import { AgentAction } from '../execution';
import { PageState } from '../perception';
import { ActionRecord } from '../session/types';

// Actions that reference a selector and need target validation
const SELECTOR_ACTIONS = new Set(['click', 'fill', 'select', 'hover']);

export class CriticLayer {
    private readonly _config: CriticConfig;

    constructor(config?: Partial<CriticConfig>) {
        this._config = { ...DEFAULT_CRITIC_CONFIG, ...config };
    }

    get config(): Readonly<CriticConfig> {
        return this._config;
    }

    // ── Main Entry Point ────────────────────────────────────

    evaluate(
        action: AgentAction,
        confidence: number,
        pageState: PageState,
        actionHistory: ActionRecord[],
    ): CriticVerdict {
        console.log(
            `[CriticLayer] Evaluating ${action.type} action ` +
            `(confidence: ${confidence.toFixed(2)})`,
        );

        // ── Check 1: Target exists ──────────────────────────
        const existsResult = this.checkTargetExists(action, pageState);
        if (!existsResult.approved) return existsResult;

        // ── Check 2: Target visible / usable ────────────────
        const visibleResult = this.checkTargetVisible(action, pageState);
        if (!visibleResult.approved) return visibleResult;

        // ── Check 3: Not repeated excessively ───────────────
        const repeatResult = this.checkNotRepeated(action, actionHistory);
        if (!repeatResult.approved) return repeatResult;

        // ── Check 4: Confidence threshold ───────────────────
        const confResult = this.checkConfidence(confidence);
        if (!confResult.approved) return confResult;

        console.log(`[CriticLayer] ✅ All checks passed`);
        return { approved: true };
    }

    // ── Check 1: Target Exists ──────────────────────────────
    // For selector-based actions, verify the selector appears
    // somewhere in the extracted page state.

    private checkTargetExists(action: AgentAction, pageState: PageState): CriticVerdict {
        if (!SELECTOR_ACTIONS.has(action.type)) {
            return { approved: true }; // no selector to validate
        }

        const selector = (action as { selector: string }).selector;

        const foundInButtons = pageState.buttons.some(b => b.selector === selector);
        const foundInInputs = pageState.inputs.some(i => i.selector === selector);
        const foundInLinks = pageState.links.some(l => l.selector === selector);

        if (foundInButtons || foundInInputs || foundInLinks) {
            return { approved: true };
        }

        return this.reject(
            'target_exists',
            `Selector "${selector}" not found in current page state ` +
            `(${pageState.buttons.length} buttons, ${pageState.inputs.length} inputs, ` +
            `${pageState.links.length} links)`,
            true,
        );
    }

    // ── Check 2: Target Visible / Usable ────────────────────
    // Verify the matched element is not disabled (for buttons)
    // and the selector is not empty.

    private checkTargetVisible(action: AgentAction, pageState: PageState): CriticVerdict {
        if (!SELECTOR_ACTIONS.has(action.type)) {
            return { approved: true };
        }

        const selector = (action as { selector: string }).selector;

        if (!selector || selector.trim() === '') {
            return this.reject(
                'target_visible',
                'Selector is empty — cannot interact with an unidentified element',
                true,
            );
        }

        // Check if the target button is disabled
        const matchedButton = pageState.buttons.find(b => b.selector === selector);
        if (matchedButton && matchedButton.disabled) {
            return this.reject(
                'target_visible',
                `Button "${matchedButton.text}" (${selector}) is disabled`,
                true,
            );
        }

        return { approved: true };
    }

    // ── Check 3: Not Repeated Excessively ───────────────────
    // If the exact same action (type + key identifiers) appears
    // in the last N consecutive history entries, reject.

    private checkNotRepeated(action: AgentAction, actionHistory: ActionRecord[]): CriticVerdict {
        const maxRepeat = this._config.maxRepeatCount;
        if (actionHistory.length < maxRepeat) {
            return { approved: true }; // not enough history to be repetitive
        }

        const actionSignature = this.getActionSignature(action);
        const tail = actionHistory.slice(-maxRepeat);

        const allMatch = tail.every(record => {
            // Compare type + detail (detail contains human-readable summary
            // which includes selector/value info)
            return record.type === action.type &&
                record.detail.includes(actionSignature);
        });

        if (allMatch) {
            return this.reject(
                'not_repeated',
                `Action "${action.type}" with signature "${actionSignature}" ` +
                `has been repeated ${maxRepeat} times consecutively — likely stuck in a loop`,
                true,
            );
        }

        return { approved: true };
    }

    // ── Check 4: Confidence Threshold ───────────────────────

    private checkConfidence(confidence: number): CriticVerdict {
        if (confidence >= this._config.minConfidence) {
            return { approved: true };
        }

        return this.reject(
            'confidence_threshold',
            `Confidence ${confidence.toFixed(2)} is below critic threshold ` +
            `${this._config.minConfidence} — re-plan required`,
            true,
        );
    }

    // ── Helpers ──────────────────────────────────────────────

    private getActionSignature(action: AgentAction): string {
        switch (action.type) {
            case 'click':
            case 'hover':
                return action.selector;
            case 'fill':
                return `${action.selector}=${action.value}`;
            case 'select':
                return `${action.selector}=${action.value}`;
            case 'type':
                return action.text;
            case 'press':
                return action.key;
            case 'navigate':
                return action.url;
            case 'scroll':
                return `${action.direction}:${action.amount ?? 300}`;
            case 'wait':
                return `${action.duration}ms`;
            default:
                return 'unknown';
        }
    }

    private reject(
        checkName: CriticCheckName,
        reason: string,
        shouldReplan: boolean,
    ): CriticVerdict {
        console.warn(`[CriticLayer] ❌ REJECTED (${checkName}): ${reason}`);
        return { approved: false, reason, checkName, shouldReplan };
    }
}
