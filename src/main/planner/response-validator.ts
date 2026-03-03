// ─── Response Validator ─────────────────────────────────────
// Strict validation pipeline: parse → check action type →
// verify required fields → check confidence → convert to
// AgentAction or reject with reason.
//
// If output invalid → reject.
// ─────────────────────────────────────────────────────────────

import {
    LLMActionResponse,
    PlannerResult,
    PlannerConfig,
    DEFAULT_PLANNER_CONFIG,
    VALID_ACTION_TYPES,
    ValidActionType,
} from './types';
import { AgentAction } from '../execution';

// ─── Required Fields Per Action Type ────────────────────────

const REQUIRED_FIELDS: Record<ValidActionType, string[]> = {
    click: ['selector'],
    fill: ['selector', 'value'],
    type: ['text'],
    press: ['key'],
    navigate: ['url'],
    scroll: ['direction'],
    select: ['selector', 'value'],
    hover: ['selector'],
    wait: ['duration'],
};

const VALID_SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'];

// ─── Main Validator ─────────────────────────────────────────

export function validateResponse(
    rawText: string,
    config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): PlannerResult {
    // ── Step 1: Parse JSON ──────────────────────────────────
    let parsed: unknown;
    try {
        // Strip markdown code fences if the LLM wraps it (common mistake)
        const cleaned = rawText
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/, '')
            .trim();
        parsed = JSON.parse(cleaned);
    } catch {
        return reject(`Failed to parse JSON: response is not valid JSON`, rawText);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return reject(`Response must be a JSON object, got ${typeof parsed}`, rawText);
    }

    const obj = parsed as Record<string, unknown>;

    // ── Step 2: Validate 'action' field ─────────────────────
    if (!('action' in obj) || typeof obj.action !== 'string') {
        return reject(`Missing or invalid "action" field`, rawText);
    }

    const actionType = obj.action as string;
    if (!(VALID_ACTION_TYPES as readonly string[]).includes(actionType)) {
        return reject(
            `Invalid action type "${actionType}". Valid types: ${VALID_ACTION_TYPES.join(', ')}`,
            rawText,
        );
    }

    const validType = actionType as ValidActionType;

    // ── Step 3: Check required fields ───────────────────────
    const requiredFields = REQUIRED_FIELDS[validType];
    for (const field of requiredFields) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null || obj[field] === '') {
            return reject(
                `Action "${validType}" requires field "${field}" but it is missing or empty`,
                rawText,
            );
        }
    }

    // ── Step 4: Validate 'confidence' ───────────────────────
    if (!('confidence' in obj) || typeof obj.confidence !== 'number') {
        return reject(`Missing or invalid "confidence" field (must be a number 0-1)`, rawText);
    }
    const confidence = obj.confidence as number;
    if (confidence < 0 || confidence > 1) {
        return reject(`Confidence must be between 0 and 1, got ${confidence}`, rawText);
    }

    // ── Step 5: Validate 'reasoning' ────────────────────────
    if (!('reasoning' in obj) || typeof obj.reasoning !== 'string' || obj.reasoning.trim() === '') {
        return reject(`Missing or empty "reasoning" field`, rawText);
    }

    // ── Step 6: Check minimum confidence threshold ──────────
    if (confidence < config.minConfidence) {
        return reject(
            `Confidence ${confidence.toFixed(2)} is below minimum threshold ${config.minConfidence}`,
            rawText,
        );
    }

    // ── Step 7: Validate type-specific field types ──────────
    const typeError = validateFieldTypes(validType, obj);
    if (typeError) {
        return reject(typeError, rawText);
    }

    // ── Step 8: Convert to AgentAction ──────────────────────
    const llmResponse: LLMActionResponse = {
        action: validType,
        selector: asOptionalString(obj.selector),
        value: asOptionalString(obj.value),
        text: asOptionalString(obj.text),
        key: asOptionalString(obj.key),
        url: asOptionalString(obj.url),
        direction: asOptionalString(obj.direction),
        amount: asOptionalNumber(obj.amount),
        duration: asOptionalNumber(obj.duration),
        confidence,
        reasoning: obj.reasoning as string,
    };

    const agentAction = toAgentAction(llmResponse);

    return {
        accepted: true,
        action: agentAction,
        confidence,
        reasoning: llmResponse.reasoning,
        rawResponse: llmResponse,
    };
}

// ─── Type-Specific Field Validation ─────────────────────────

function validateFieldTypes(actionType: ValidActionType, obj: Record<string, unknown>): string | null {
    switch (actionType) {
        case 'click':
        case 'hover':
            if (typeof obj.selector !== 'string') return `"selector" must be a string`;
            break;
        case 'fill':
            if (typeof obj.selector !== 'string') return `"selector" must be a string`;
            if (typeof obj.value !== 'string') return `"value" must be a string`;
            break;
        case 'type':
            if (typeof obj.text !== 'string') return `"text" must be a string`;
            break;
        case 'press':
            if (typeof obj.key !== 'string') return `"key" must be a string`;
            break;
        case 'navigate':
            if (typeof obj.url !== 'string') return `"url" must be a string`;
            break;
        case 'scroll':
            if (typeof obj.direction !== 'string') return `"direction" must be a string`;
            if (!VALID_SCROLL_DIRECTIONS.includes(obj.direction as string)) {
                return `"direction" must be one of: ${VALID_SCROLL_DIRECTIONS.join(', ')}`;
            }
            if (obj.amount !== undefined && typeof obj.amount !== 'number') {
                return `"amount" must be a number if provided`;
            }
            break;
        case 'select':
            if (typeof obj.selector !== 'string') return `"selector" must be a string`;
            if (typeof obj.value !== 'string') return `"value" must be a string`;
            break;
        case 'wait':
            if (typeof obj.duration !== 'number') return `"duration" must be a number (ms)`;
            if (obj.duration < 0) return `"duration" must be non-negative`;
            break;
    }
    return null;
}

// ─── Conversion: LLMActionResponse → AgentAction ────────────

function toAgentAction(resp: LLMActionResponse): AgentAction {
    switch (resp.action) {
        case 'click':
            return { type: 'click', selector: resp.selector! };
        case 'fill':
            return { type: 'fill', selector: resp.selector!, value: resp.value! };
        case 'type':
            return { type: 'type', text: resp.text! };
        case 'press':
            return { type: 'press', key: resp.key! };
        case 'navigate':
            return { type: 'navigate', url: resp.url! };
        case 'scroll':
            return {
                type: 'scroll',
                direction: resp.direction as 'up' | 'down' | 'left' | 'right',
                amount: resp.amount,
            };
        case 'select':
            return { type: 'select', selector: resp.selector!, value: resp.value! };
        case 'hover':
            return { type: 'hover', selector: resp.selector! };
        case 'wait':
            return { type: 'wait', duration: resp.duration! };
        default:
            // Should never reach here after validation
            throw new Error(`Unknown action type: ${resp.action}`);
    }
}

// ─── Utility ────────────────────────────────────────────────

function reject(reason: string, rawText: string): PlannerResult {
    console.warn(`[ResponseValidator] REJECTED: ${reason}`);
    return { accepted: false, reason, rawText };
}

function asOptionalString(val: unknown): string | undefined {
    return typeof val === 'string' ? val : undefined;
}

function asOptionalNumber(val: unknown): number | undefined {
    return typeof val === 'number' ? val : undefined;
}
