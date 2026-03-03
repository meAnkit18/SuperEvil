// ─── Critic Layer Types ─────────────────────────────────────
// Safety gate between planner and executor. Every proposed
// action must pass the critic before it reaches execution.
// ─────────────────────────────────────────────────────────────

// ─── Verdict ────────────────────────────────────────────────

export type CriticVerdict =
    | { approved: true }
    | {
        approved: false;
        reason: string;
        checkName: CriticCheckName;
        shouldReplan: boolean;   // hint to caller: re-plan vs abort
    };

// ─── Check Names ────────────────────────────────────────────

export type CriticCheckName =
    | 'target_exists'
    | 'target_visible'
    | 'not_repeated'
    | 'confidence_threshold';

// ─── Configuration ──────────────────────────────────────────

export interface CriticConfig {
    minConfidence: number;      // reject if planner confidence < this (default 0.4)
    maxRepeatCount: number;     // reject if same action repeated > N times (default 3)
}

export const DEFAULT_CRITIC_CONFIG: CriticConfig = {
    minConfidence: 0.4,
    maxRepeatCount: 3,
};
