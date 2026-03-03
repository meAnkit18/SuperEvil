// ─── Auth Module Barrel ─────────────────────────────────────
export { detectLogin } from './login-detector';
export { CredentialVault } from './credential-vault';
export { AutoLogin } from './auto-login';
export {
    type LoginSignal,
    type StoredCredential,
    type VaultConfig,
    type DecryptedCredential,
    type CaptchaType,
    type CaptchaSignal,
    type AutoLoginResult,
} from './types';

