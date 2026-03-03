// ─── Authentication System Types ────────────────────────────
// Types for login detection and encrypted credential storage.
// ─────────────────────────────────────────────────────────────

// ── Login Detection ─────────────────────────────────────────

export interface LoginSignal {
    isLoginPage: boolean;
    confidence: number;          // 0.0 – 1.0
    signals: string[];           // human-readable list of why we think it's a login page
    passwordInputSelector?: string;
    usernameInputSelector?: string;
    submitSelector?: string;
}

// ── Credential Vault ────────────────────────────────────────

export interface StoredCredential {
    domain: string;
    username: string;
    encryptedPassword: string;   // base64-encoded AES-256-GCM ciphertext
    iv: string;                  // base64-encoded initialisation vector
    authTag: string;             // base64-encoded GCM authentication tag
    createdAt: number;           // epoch ms
    updatedAt: number;           // epoch ms
}

export interface VaultConfig {
    vaultPath: string;           // absolute path to the vault JSON file
    encryptionKey?: string;      // optional master passphrase (auto-generated if omitted)
}

export interface DecryptedCredential {
    domain: string;
    username: string;
    password: string;
}

// ── CAPTCHA Detection ───────────────────────────────────────

export type CaptchaType = 'recaptcha' | 'hcaptcha' | 'turnstile' | 'unknown';

export interface CaptchaSignal {
    detected: boolean;
    type: CaptchaType;
    selector?: string;
}

// ── Auto-Login Result ───────────────────────────────────────

export type AutoLoginResult =
    | { status: 'success' }
    | { status: 'not_login_page' }
    | { status: 'no_credentials'; domain: string }
    | { status: 'captcha_blocked'; captcha: CaptchaSignal }
    | { status: 'captcha_resolved' }
    | { status: 'login_failed'; reason: string }
    | { status: 'error'; message: string };
