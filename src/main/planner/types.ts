// ─── LLM Tactical Planner Types ─────────────────────────────
// Strict contract for LLM responses, planner I/O, and config.
// ─────────────────────────────────────────────────────────────

import { AgentAction } from '../execution';
import { PageState } from '../perception';
import { ActionRecord } from '../session/types';
import { AgentState } from '../session/state-machine';

// ─── LLM Response Contract ─────────────────────────────────
// The exact JSON shape the LLM MUST return. Anything else is
// rejected outright.

export interface LLMActionResponse {
    action: string;             // one of the 9 valid AgentAction types
    selector?: string;          // for click, fill, select, hover
    value?: string;             // for fill, select
    text?: string;              // for type action
    key?: string;               // for press (e.g. 'Enter', 'Tab')
    url?: string;               // for navigate
    direction?: string;         // for scroll ('up' | 'down' | 'left' | 'right')
    amount?: number;            // for scroll (px)
    duration?: number;          // for wait (ms)
    confidence: number;         // 0–1 how sure the LLM is
    reasoning: string;          // why this action was chosen
}

// ── Valid action types (mirrors AgentAction union) ──────────

export const VALID_ACTION_TYPES = [
    'click', 'fill', 'type', 'press', 'navigate',
    'scroll', 'select', 'hover', 'wait',
] as const;

export type ValidActionType = typeof VALID_ACTION_TYPES[number];

// ─── Planner Input ──────────────────────────────────────────
// Everything the planner needs to decide the next action.

export interface PlannerInput {
    goal: string;
    pageState: PageState;
    actionHistory: ActionRecord[];
    currentState: AgentState;
}

// ─── Planner Result ─────────────────────────────────────────
// Either a validated action or a rejection with reason.

export type PlannerResult =
    | {
        accepted: true;
        action: AgentAction;
        confidence: number;
        reasoning: string;
        rawResponse: LLMActionResponse;
    }
    | {
        accepted: false;
        reason: string;
        rawText?: string;
    };

// ─── Planner Configuration ─────────────────────────────────

export interface PlannerConfig {
    maxHistoryItems: number;    // how many past actions to include (default 5)
    minConfidence: number;      // reject below this threshold (default 0.3)
    maxRetries: number;         // retry on invalid response (default 2)
    maxVisibleTextLength: number; // truncate visible text summary (default 500)
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
    maxHistoryItems: 5,
    minConfidence: 0.3,
    maxRetries: 2,
    maxVisibleTextLength: 500,
};
