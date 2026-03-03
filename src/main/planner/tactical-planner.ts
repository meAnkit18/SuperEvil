// ─── Tactical Planner ───────────────────────────────────────
// Orchestrates: build prompt → call LLM → validate response →
// retry if rejected → return PlannerResult.
//
// The callLLM() method is a protected stub — override or replace
// when integrating a real provider (Groq, OpenAI, etc.).
// ─────────────────────────────────────────────────────────────

import {
    PlannerInput,
    PlannerResult,
    PlannerConfig,
    DEFAULT_PLANNER_CONFIG,
} from './types';
import { buildSystemPrompt, buildUserPrompt, buildRetryContext } from './prompt-builder';
import { validateResponse } from './response-validator';

// ─── TacticalPlanner ────────────────────────────────────────

export class TacticalPlanner {
    private readonly _config: PlannerConfig;

    constructor(config?: Partial<PlannerConfig>) {
        this._config = { ...DEFAULT_PLANNER_CONFIG, ...config };
    }

    // ── Config accessor ─────────────────────────────────────

    get config(): Readonly<PlannerConfig> {
        return this._config;
    }

    // ── Core Decision Method ────────────────────────────────
    // Given the planner input, produces a validated action or
    // a rejection. Retries up to maxRetries on invalid output.

    async decide(input: PlannerInput): Promise<PlannerResult> {
        const systemPrompt = buildSystemPrompt();
        let userPrompt = buildUserPrompt(input, this._config);

        let lastResult: PlannerResult | null = null;

        for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
            const attemptLabel = attempt === 0
                ? 'initial'
                : `retry ${attempt}/${this._config.maxRetries}`;

            console.log(`[TacticalPlanner] Attempt (${attemptLabel}) — calling LLM...`);

            let rawText: string;
            try {
                rawText = await this.callLLM(systemPrompt, userPrompt);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[TacticalPlanner] LLM call failed: ${message}`);
                return {
                    accepted: false,
                    reason: `LLM call failed: ${message}`,
                };
            }

            console.log(`[TacticalPlanner] Raw LLM response (${rawText.length} chars)`);

            // Validate
            const result = validateResponse(rawText, this._config);
            lastResult = result;

            if (result.accepted) {
                console.log(
                    `[TacticalPlanner] ✅ Accepted: ${result.action.type} ` +
                    `(confidence: ${result.confidence.toFixed(2)})`,
                );
                return result;
            }

            // Rejected — log and prepare retry
            console.warn(
                `[TacticalPlanner] ❌ Rejected (${attemptLabel}): ${result.reason}`,
            );

            if (attempt < this._config.maxRetries) {
                // Append retry context to user prompt for next attempt
                userPrompt += '\n\n' + buildRetryContext(
                    result.rawText ?? rawText,
                    result.reason,
                );
            }
        }

        // All retries exhausted
        console.error('[TacticalPlanner] All retries exhausted — returning final rejection');
        return lastResult ?? {
            accepted: false,
            reason: 'All retries exhausted with no valid response',
        };
    }

    // ── Prompt Accessors (for debugging / testing) ──────────

    getSystemPrompt(): string {
        return buildSystemPrompt();
    }

    getUserPrompt(input: PlannerInput): string {
        return buildUserPrompt(input, this._config);
    }

    // ── LLM Call Stub ───────────────────────────────────────
    // Override this method when integrating a real LLM provider.
    // It receives the system and user prompts and must return
    // the raw LLM response string.

    protected async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
        console.log('[TacticalPlanner] callLLM() stub invoked.');
        console.log(`[TacticalPlanner] System prompt length: ${systemPrompt.length}`);
        console.log(`[TacticalPlanner] User prompt length: ${userPrompt.length}`);

        throw new Error(
            'TacticalPlanner.callLLM() is not implemented. ' +
            'Override this method or extend TacticalPlanner to integrate your LLM provider ' +
            '(e.g. Groq, OpenAI, local model).',
        );
    }
}
