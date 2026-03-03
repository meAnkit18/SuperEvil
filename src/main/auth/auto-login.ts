// ─── Auto Login ─────────────────────────────────────────────
// Autonomous login orchestrator. Bridges login detector,
// credential vault, and action executor to perform fully
// automated sign-in without LLM involvement.
//
// Flow:
//   1. Detect login page (via LoginDetector)
//   2. Extract domain → look up vault
//   3. Fill username + password
//   4. Detect CAPTCHA → BLOCKED + poll for resolution
//   5. Submit form
//   6. Verify login succeeded (password field gone)
// ─────────────────────────────────────────────────────────────

import { Page } from 'playwright';
import { PageState } from '../perception';
import { ActionExecutor } from '../execution';
import { detectLogin } from './login-detector';
import { CredentialVault } from './credential-vault';
import { LoginSignal, CaptchaSignal, CaptchaType, AutoLoginResult } from './types';

// ── Constants ───────────────────────────────────────────────

const CAPTCHA_POLL_INTERVAL = 3_000;   // ms between CAPTCHA checks
const CAPTCHA_POLL_TIMEOUT = 120_000;  // max wait for user to solve
const POST_SUBMIT_WAIT = 3_000;        // wait after submit for page load

// ── CAPTCHA Selectors ───────────────────────────────────────

const CAPTCHA_SELECTORS: { selector: string; type: CaptchaType }[] = [
    { selector: 'iframe[src*="recaptcha"]', type: 'recaptcha' },
    { selector: 'iframe[src*="google.com/recaptcha"]', type: 'recaptcha' },
    { selector: '.g-recaptcha', type: 'recaptcha' },
    { selector: '#g-recaptcha', type: 'recaptcha' },
    { selector: 'iframe[src*="hcaptcha"]', type: 'hcaptcha' },
    { selector: '.h-captcha', type: 'hcaptcha' },
    { selector: 'iframe[src*="challenges.cloudflare.com"]', type: 'turnstile' },
    { selector: '.cf-turnstile', type: 'turnstile' },
    { selector: '[class*="captcha"]', type: 'unknown' },
    { selector: '[id*="captcha"]', type: 'unknown' },
];

type StatusCallback = (message: string) => void;

// ─── AutoLogin ──────────────────────────────────────────────

export class AutoLogin {
    private readonly _vault: CredentialVault;
    private readonly _onStatus: StatusCallback;

    constructor(vault: CredentialVault, onStatus: StatusCallback) {
        this._vault = vault;
        this._onStatus = onStatus;
    }

    // ── Main Entry Point ────────────────────────────────────

    async execute(page: Page, pageState: PageState): Promise<AutoLoginResult> {
        // 1. Detect login page
        const loginSignal = detectLogin(pageState);
        if (!loginSignal.isLoginPage) {
            return { status: 'not_login_page' };
        }

        this._onStatus(
            `🔐 Login page detected (confidence: ${loginSignal.confidence.toFixed(2)})`,
        );

        // 2. Extract domain and look up credentials
        const domain = this.extractDomain(page.url());
        const creds = this._vault.get(domain);

        if (!creds) {
            this._onStatus(`⚠️ No credentials found for domain: ${domain}`);
            return { status: 'no_credentials', domain };
        }

        this._onStatus(`🔑 Credentials found for ${domain} (user: ${creds.username})`);

        // 3. Fill the form
        const executor = new ActionExecutor(page, this._onStatus);

        try {
            await this.fillForm(executor, loginSignal, creds.username, creds.password);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this._onStatus(`❌ Failed to fill login form: ${message}`);
            return { status: 'error', message: `Fill failed: ${message}` };
        }

        // 4. Check for CAPTCHA before submitting
        const captcha = await this.detectCaptcha(page);

        if (captcha.detected) {
            this._onStatus(
                `🧩 CAPTCHA detected (${captcha.type})` +
                `${captcha.selector ? ` at "${captcha.selector}"` : ''} — waiting for user...`,
            );

            // Poll for CAPTCHA resolution
            const resolved = await this.waitForCaptchaResolution(page);

            if (!resolved) {
                this._onStatus('🚫 CAPTCHA timeout — still blocked');
                return { status: 'captcha_blocked', captcha };
            }

            this._onStatus('✅ CAPTCHA resolved — continuing login');
        }

        // 5. Submit the form
        try {
            await this.submitForm(executor, page, loginSignal);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this._onStatus(`❌ Failed to submit login form: ${message}`);
            return { status: 'error', message: `Submit failed: ${message}` };
        }

        // 6. Verify login success
        await page.waitForTimeout(POST_SUBMIT_WAIT);

        const postLoginState = await this.checkLoginSuccess(page);

        if (postLoginState) {
            this._onStatus('✅ Login successful — login form is gone');
            return { status: 'success' };
        } else {
            this._onStatus('⚠️ Login form still present — credentials may be incorrect');
            return { status: 'login_failed', reason: 'Login form still present after submission' };
        }
    }

    // ── Form Fill ───────────────────────────────────────────

    private async fillForm(
        executor: ActionExecutor,
        signal: LoginSignal,
        username: string,
        password: string,
    ): Promise<void> {
        // Fill username if selector is available
        if (signal.usernameInputSelector) {
            this._onStatus(`📝 Filling username → "${signal.usernameInputSelector}"`);
            await executor.execute({
                type: 'fill',
                selector: signal.usernameInputSelector,
                value: username,
            });
        }

        // Fill password (must be present — the detector requires it)
        if (signal.passwordInputSelector) {
            this._onStatus(`📝 Filling password → "${signal.passwordInputSelector}"`);
            await executor.execute({
                type: 'fill',
                selector: signal.passwordInputSelector,
                value: password,
            });
        }
    }

    // ── Form Submit ─────────────────────────────────────────

    private async submitForm(
        executor: ActionExecutor,
        page: Page,
        signal: LoginSignal,
    ): Promise<void> {
        if (signal.submitSelector) {
            this._onStatus(`🖱️ Clicking submit → "${signal.submitSelector}"`);
            await executor.execute({
                type: 'click',
                selector: signal.submitSelector,
            });
        } else {
            // Fallback: press Enter on the password field
            this._onStatus('⏎ No submit button found — pressing Enter');
            if (signal.passwordInputSelector) {
                await page.click(signal.passwordInputSelector);
            }
            await executor.execute({ type: 'press', key: 'Enter' });
        }
    }

    // ── CAPTCHA Detection ───────────────────────────────────

    async detectCaptcha(page: Page): Promise<CaptchaSignal> {
        for (const { selector, type } of CAPTCHA_SELECTORS) {
            try {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    console.log(`[AutoLogin] CAPTCHA detected: ${type} via "${selector}"`);
                    return { detected: true, type, selector };
                }
            } catch {
                // Selector evaluation failed — skip
            }
        }

        // Also check visible text for CAPTCHA keywords
        try {
            const hasCaptchaText = await page.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return (
                    text.includes('i\'m not a robot') ||
                    text.includes('verify you are human') ||
                    text.includes('complete the captcha') ||
                    text.includes('security check')
                );
            });

            if (hasCaptchaText) {
                console.log('[AutoLogin] CAPTCHA detected via visible text');
                return { detected: true, type: 'unknown' };
            }
        } catch {
            // Page evaluation failed — assume no CAPTCHA
        }

        return { detected: false, type: 'unknown' };
    }

    // ── CAPTCHA Polling ─────────────────────────────────────
    // Polls every CAPTCHA_POLL_INTERVAL ms until the CAPTCHA
    // element disappears, or CAPTCHA_POLL_TIMEOUT is reached.

    private async waitForCaptchaResolution(page: Page): Promise<boolean> {
        const deadline = Date.now() + CAPTCHA_POLL_TIMEOUT;
        let pollCount = 0;

        while (Date.now() < deadline) {
            await page.waitForTimeout(CAPTCHA_POLL_INTERVAL);
            pollCount++;

            const captcha = await this.detectCaptcha(page);

            if (!captcha.detected) {
                console.log(
                    `[AutoLogin] CAPTCHA resolved after ${pollCount} polls ` +
                    `(${(pollCount * CAPTCHA_POLL_INTERVAL / 1000).toFixed(0)}s)`,
                );
                return true;
            }

            this._onStatus(
                `🧩 Waiting for CAPTCHA... ` +
                `(${Math.ceil((deadline - Date.now()) / 1000)}s remaining)`,
            );
        }

        console.log(`[AutoLogin] CAPTCHA timeout after ${CAPTCHA_POLL_TIMEOUT / 1000}s`);
        return false;
    }

    // ── Post-Login Check ────────────────────────────────────
    // Returns true if the login form is gone (password input
    // no longer present) — indicating successful authentication.

    private async checkLoginSuccess(page: Page): Promise<boolean> {
        try {
            const passwordInputCount = await page.locator('input[type="password"]').count();
            return passwordInputCount === 0;
        } catch {
            // If we can't query the page, assume navigation happened (success)
            return true;
        }
    }

    // ── Domain Extraction ───────────────────────────────────

    private extractDomain(url: string): string {
        try {
            const parsed = new URL(url);
            // Remove www. prefix for consistent vault lookup
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    }
}
