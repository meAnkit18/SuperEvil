// ─── Login Detector ─────────────────────────────────────────
// Heuristic-based login page detection. Analyses the existing
// PageState (from the perception layer) to decide whether the
// current page is a login/sign-in form.
//
// Signals and their weights:
//   Password input field       → +0.40
//   "Sign in" text / button    → +0.25
//   "Login" text / button      → +0.25
//   Username-like input        → +0.10
//
// isLoginPage is true when confidence >= 0.40 (at minimum a
// password field must be present).
// ─────────────────────────────────────────────────────────────

import { PageState, ButtonInfo, InputInfo } from '../perception';
import { LoginSignal } from './types';

// ── Regex Patterns ──────────────────────────────────────────

const SIGN_IN_PATTERN = /sign\s*in/i;
const LOGIN_PATTERN = /log\s*in/i;
const USERNAME_NAME_PATTERN = /user|email|login|account/i;
const SUBMIT_TEXT_PATTERN = /sign\s*in|log\s*in|submit|continue|next/i;

// ── Confidence Threshold ────────────────────────────────────

const LOGIN_THRESHOLD = 0.40;

// ─── detectLogin ────────────────────────────────────────────

export function detectLogin(state: PageState): LoginSignal {
    let confidence = 0;
    const signals: string[] = [];

    let passwordInputSelector: string | undefined;
    let usernameInputSelector: string | undefined;
    let submitSelector: string | undefined;

    // ── 1. Password input (+0.40) ───────────────────────────

    const passwordInput = findPasswordInput(state.inputs);
    if (passwordInput) {
        confidence += 0.40;
        signals.push(`Password input found: ${passwordInput.selector}`);
        passwordInputSelector = passwordInput.selector;
    }

    // ── 2. "Sign in" in buttons or visible text (+0.25) ─────

    if (matchesButtonText(state.buttons, SIGN_IN_PATTERN)) {
        confidence += 0.25;
        signals.push('"Sign in" button detected');
        if (!submitSelector) {
            submitSelector = findMatchingButton(state.buttons, SIGN_IN_PATTERN)?.selector;
        }
    } else if (SIGN_IN_PATTERN.test(state.visibleTextSummary)) {
        confidence += 0.25;
        signals.push('"Sign in" text found on page');
    }

    // ── 3. "Login" in buttons or visible text (+0.25) ───────

    if (matchesButtonText(state.buttons, LOGIN_PATTERN)) {
        confidence += 0.25;
        signals.push('"Login" button detected');
        if (!submitSelector) {
            submitSelector = findMatchingButton(state.buttons, LOGIN_PATTERN)?.selector;
        }
    } else if (LOGIN_PATTERN.test(state.visibleTextSummary)) {
        confidence += 0.25;
        signals.push('"Login" text found on page');
    }

    // ── 4. Username-like input (+0.10) ──────────────────────

    const usernameInput = findUsernameInput(state.inputs);
    if (usernameInput) {
        confidence += 0.10;
        signals.push(`Username/email input found: ${usernameInput.selector}`);
        usernameInputSelector = usernameInput.selector;
    }

    // ── 5. Fall-back submit button detection ────────────────

    if (!submitSelector) {
        const fallbackSubmit = findMatchingButton(state.buttons, SUBMIT_TEXT_PATTERN);
        if (fallbackSubmit) {
            submitSelector = fallbackSubmit.selector;
        }
    }

    // ── Clamp confidence to [0, 1] ──────────────────────────

    confidence = Math.min(1, Math.max(0, confidence));

    const isLoginPage = confidence >= LOGIN_THRESHOLD;

    console.log(
        `[LoginDetector] confidence=${confidence.toFixed(2)} ` +
        `isLogin=${isLoginPage} signals=[${signals.join('; ')}]`,
    );

    return {
        isLoginPage,
        confidence,
        signals,
        passwordInputSelector,
        usernameInputSelector,
        submitSelector,
    };
}

// ─── Internal Helpers ───────────────────────────────────────

function findPasswordInput(inputs: InputInfo[]): InputInfo | undefined {
    return inputs.find(i => i.type === 'password');
}

function findUsernameInput(inputs: InputInfo[]): InputInfo | undefined {
    return inputs.find(i => {
        if (i.type !== 'text' && i.type !== 'email') return false;
        const haystack = `${i.name} ${i.placeholder}`;
        return USERNAME_NAME_PATTERN.test(haystack);
    });
}

function matchesButtonText(buttons: ButtonInfo[], pattern: RegExp): boolean {
    return buttons.some(b => pattern.test(b.text));
}

function findMatchingButton(buttons: ButtonInfo[], pattern: RegExp): ButtonInfo | undefined {
    return buttons.find(b => pattern.test(b.text));
}
