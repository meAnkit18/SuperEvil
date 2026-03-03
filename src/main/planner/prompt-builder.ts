// ─── Prompt Builder ─────────────────────────────────────────
// Constructs strict system + user prompts for the LLM tactical
// planner.  The LLM receives structured page state — never raw
// DOM — and must respond with a single JSON action object.
// ─────────────────────────────────────────────────────────────

import { PlannerInput, PlannerConfig, DEFAULT_PLANNER_CONFIG } from './types';
import { ActionRecord } from '../session/types';
import { PageState, ButtonInfo, InputInfo, LinkInfo } from '../perception';

// ─── System Prompt ──────────────────────────────────────────

export function buildSystemPrompt(): string {
    return `You are a browser automation tactical planner. Your ONLY job is to decide the single next action for a web browser agent working toward a user-defined goal.

RULES:
1. Respond with a SINGLE JSON object. No markdown, no code fences, no explanation outside the JSON.
2. Every response MUST include: "action", "confidence" (0-1), and "reasoning" (short string).
3. Pick exactly ONE action from the list below. Include only the fields required for that action type.
4. If you are unsure, set confidence low but still pick the best available action.
5. Never invent selectors — only use selectors from the INTERACTIVE ELEMENTS list provided.
6. If the goal appears already achieved, use action "wait" with duration 0 and confidence 1.0.

VALID ACTIONS AND REQUIRED FIELDS:

| action     | required fields                          | description                       |
|------------|------------------------------------------|-----------------------------------|
| click      | selector (string)                        | Click an interactive element      |
| fill       | selector (string), value (string)        | Clear input and type value        |
| type       | text (string)                            | Type text without targeting field |
| press      | key (string)                             | Press a keyboard key              |
| navigate   | url (string)                             | Go to a URL                       |
| scroll     | direction (up|down|left|right)           | Scroll the page (amount optional) |
| select     | selector (string), value (string)        | Select dropdown option            |
| hover      | selector (string)                        | Hover over an element             |
| wait       | duration (number, ms)                    | Wait before next action           |

RESPONSE FORMAT (strict JSON):
{
  "action": "<action_type>",
  "<required_field_1>": "<value>",
  "<required_field_2>": "<value>",
  "confidence": <0.0-1.0>,
  "reasoning": "<why this action moves toward the goal>"
}

EXAMPLES:

Goal: "Search for flights to Tokyo"
Page has a search input [selector: input#search] and a submit button [selector: button#submit]
Response:
{"action":"fill","selector":"input#search","value":"flights to Tokyo","confidence":0.92,"reasoning":"Filling the search box with the query is the first step toward searching."}

Goal: "Login to my account"
Page has email input [selector: input[name=email]] filled, password input [selector: input[name=password]] empty
Response:
{"action":"click","selector":"input[name=password]","confidence":0.85,"reasoning":"Email is filled, need to focus password field next."}`;
}

// ─── User Prompt ────────────────────────────────────────────

export function buildUserPrompt(input: PlannerInput, config: PlannerConfig = DEFAULT_PLANNER_CONFIG): string {
    const { goal, pageState, actionHistory, currentState } = input;

    const sections: string[] = [];

    // ── Goal ────────────────────────────────────────────────
    sections.push(`GOAL: ${goal}`);

    // ── Current page info ───────────────────────────────────
    sections.push(`CURRENT URL: ${pageState.url}`);
    sections.push(`PAGE TITLE: ${pageState.title}`);
    sections.push(`AGENT STATE: ${currentState}`);

    // ── Interactive elements ────────────────────────────────
    sections.push(formatInteractiveElements(pageState));

    // ── Visible text summary ────────────────────────────────
    const visibleText = pageState.visibleTextSummary.length > config.maxVisibleTextLength
        ? pageState.visibleTextSummary.slice(0, config.maxVisibleTextLength) + '…'
        : pageState.visibleTextSummary;
    sections.push(`VISIBLE TEXT SUMMARY:\n${visibleText}`);

    // ── Action history ──────────────────────────────────────
    const recentActions = actionHistory.slice(-config.maxHistoryItems);
    sections.push(formatActionHistory(recentActions));

    // ── Instruction ─────────────────────────────────────────
    sections.push('Decide the single next action. Respond with JSON only.');

    return sections.join('\n\n');
}

// ─── Helpers ────────────────────────────────────────────────

function formatInteractiveElements(state: PageState): string {
    const lines: string[] = ['INTERACTIVE ELEMENTS:'];
    let idx = 0;

    // Buttons
    if (state.buttons.length > 0) {
        lines.push('  Buttons:');
        for (const btn of state.buttons) {
            idx++;
            const disabled = btn.disabled ? ' (DISABLED)' : '';
            lines.push(`    [${idx}] text="${btn.text}" selector="${btn.selector}" type=${btn.type}${disabled}`);
        }
    }

    // Inputs
    if (state.inputs.length > 0) {
        lines.push('  Inputs:');
        for (const inp of state.inputs) {
            idx++;
            const val = inp.value ? ` value="${inp.value}"` : '';
            const ph = inp.placeholder ? ` placeholder="${inp.placeholder}"` : '';
            lines.push(`    [${idx}] type=${inp.type} name="${inp.name}" selector="${inp.selector}"${ph}${val}`);
        }
    }

    // Links
    if (state.links.length > 0) {
        lines.push('  Links:');
        for (const link of state.links) {
            idx++;
            lines.push(`    [${idx}] text="${link.text}" href="${link.href}" selector="${link.selector}"`);
        }
    }

    if (idx === 0) {
        lines.push('  (no interactive elements detected)');
    }

    return lines.join('\n');
}

function formatActionHistory(actions: ActionRecord[]): string {
    if (actions.length === 0) {
        return 'LAST ACTIONS:\n  (none — this is the first action)';
    }

    const lines: string[] = [`LAST ${actions.length} ACTIONS (newest last):`];
    for (const act of actions) {
        const status = act.success ? '✓' : '✗';
        const err = act.error ? ` error="${act.error}"` : '';
        lines.push(`  ${status} [${act.type}] ${act.detail}${err}`);
    }
    return lines.join('\n');
}

// ─── Retry Prompt ───────────────────────────────────────────
// Appended to the user prompt when a previous attempt was rejected.

export function buildRetryContext(previousRawText: string, rejectionReason: string): string {
    return `YOUR PREVIOUS RESPONSE WAS REJECTED.

Previous response:
${previousRawText}

Rejection reason: ${rejectionReason}

Please fix your response. Reply with valid JSON only, following the exact format specified in the system prompt.`;
}
