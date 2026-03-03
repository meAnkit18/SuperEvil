// ─── Execution Engine Types ─────────────────────────────────
// Structured action format for the agent execution engine.
// Each action is a discriminated union keyed on `type`.
// ─────────────────────────────────────────────────────────────

// ── Individual Action Shapes ────────────────────────────────

export interface ClickAction {
    type: 'click';
    selector: string;
}

export interface FillAction {
    type: 'fill';
    selector: string;
    value: string;
}

export interface TypeAction {
    type: 'type';
    text: string;
}

export interface PressAction {
    type: 'press';
    key: string;           // e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown'
}

export interface NavigateAction {
    type: 'navigate';
    url: string;
}

export interface ScrollAction {
    type: 'scroll';
    direction: 'up' | 'down' | 'left' | 'right';
    amount?: number;       // pixels, default 300
}

export interface SelectAction {
    type: 'select';
    selector: string;
    value: string;         // option value to select
}

export interface HoverAction {
    type: 'hover';
    selector: string;
}

export interface WaitAction {
    type: 'wait';
    duration: number;      // milliseconds
}

// ── Discriminated Union ─────────────────────────────────────

export type AgentAction =
    | ClickAction
    | FillAction
    | TypeAction
    | PressAction
    | NavigateAction
    | ScrollAction
    | SelectAction
    | HoverAction
    | WaitAction;

// ── Execution Result ────────────────────────────────────────

export interface ActionResult {
    success: boolean;
    error?: string;
    durationMs: number;
    actionType: AgentAction['type'];
    detail: string;        // human-readable summary of what was executed
}
