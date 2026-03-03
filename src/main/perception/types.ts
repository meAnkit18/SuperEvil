// ─── Perception Engine Types ────────────────────────────────
// Structured output from DOM extraction. These types are what
// the LLM receives — never raw DOM.
// ─────────────────────────────────────────────────────────────

export interface ButtonInfo {
    text: string;
    selector: string;
    disabled: boolean;
    type: string;           // 'button' | 'submit' | 'reset' | role="button"
}

export interface InputInfo {
    selector: string;
    type: string;           // 'text' | 'password' | 'email' | 'search' etc.
    placeholder: string;
    value: string;
    name: string;
}

export interface LinkInfo {
    text: string;
    href: string;
    selector: string;
}

export interface AccessibilityNode {
    role: string;
    name: string;
    value?: string;
    description?: string;
    children?: AccessibilityNode[];
}

// ─── Top-Level Page State ───────────────────────────────────

export interface PageState {
    url: string;
    title: string;
    buttons: ButtonInfo[];
    inputs: InputInfo[];
    links: LinkInfo[];
    visibleTextSummary: string;
    accessibilityTree: AccessibilityNode | null;
    timestamp: number;     // epoch ms
}
