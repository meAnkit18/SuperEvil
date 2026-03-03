// ─── Credential Vault ───────────────────────────────────────
// AES-256-GCM encrypted credential storage using Node.js
// built-in `crypto`. Zero external dependencies.
//
// Vault file format (JSON on disk):
// {
//   "salt": "<base64>",
//   "credentials": [ StoredCredential, … ]
// }
//
// Encryption key is derived from a master passphrase via
// scryptSync. If no passphrase is provided, a random 32-byte
// key is generated and stored alongside the vault.
// ─────────────────────────────────────────────────────────────

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StoredCredential, VaultConfig, DecryptedCredential } from './types';

// ── Constants ───────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;           // 128-bit IV
const KEY_LENGTH = 32;          // 256-bit key
const SALT_LENGTH = 32;
const SCRYPT_COST = 16384;      // N parameter
const SCRYPT_BLOCK = 8;         // r parameter
const SCRYPT_PARALLEL = 1;      // p parameter

// ── Vault File Shape ────────────────────────────────────────

interface VaultFile {
    salt: string;                // base64
    autoKey?: string;            // base64, only present when no passphrase given
    credentials: StoredCredential[];
}

// ─── CredentialVault ────────────────────────────────────────

export class CredentialVault {
    private readonly _vaultPath: string;
    private _key: Buffer;
    private _credentials: StoredCredential[] = [];

    // ── Constructor ─────────────────────────────────────────

    constructor(config: VaultConfig) {
        this._vaultPath = config.vaultPath;

        // Ensure parent directory exists
        const dir = path.dirname(this._vaultPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Load or bootstrap
        if (fs.existsSync(this._vaultPath)) {
            const raw = fs.readFileSync(this._vaultPath, 'utf-8');
            const vault: VaultFile = JSON.parse(raw);
            this._credentials = vault.credentials;

            const salt = Buffer.from(vault.salt, 'base64');

            if (config.encryptionKey) {
                this._key = this.deriveKey(config.encryptionKey, salt);
            } else if (vault.autoKey) {
                this._key = Buffer.from(vault.autoKey, 'base64');
            } else {
                throw new Error(
                    '[CredentialVault] Vault exists but no passphrase or autoKey found.',
                );
            }
        } else {
            const salt = crypto.randomBytes(SALT_LENGTH);

            if (config.encryptionKey) {
                this._key = this.deriveKey(config.encryptionKey, salt);
                this.writeToDisk(salt);
            } else {
                this._key = crypto.randomBytes(KEY_LENGTH);
                this.writeToDisk(salt, this._key);
            }
        }

        console.log(
            `[CredentialVault] Initialised — ${this._credentials.length} credential(s) loaded`,
        );
    }

    // ── Public API ──────────────────────────────────────────

    /** Encrypt and store (or update) credentials for a domain. */
    save(domain: string, username: string, password: string): void {
        const { ciphertext, iv, authTag } = this.encrypt(password);
        const now = Date.now();

        const idx = this._credentials.findIndex(c => c.domain === domain);

        const record: StoredCredential = {
            domain,
            username,
            encryptedPassword: ciphertext,
            iv,
            authTag,
            createdAt: idx >= 0 ? this._credentials[idx].createdAt : now,
            updatedAt: now,
        };

        if (idx >= 0) {
            this._credentials[idx] = record;
        } else {
            this._credentials.push(record);
        }

        this.persist();
        console.log(`[CredentialVault] Saved credentials for "${domain}"`);
    }

    /** Decrypt and return credentials for a domain (or null). */
    get(domain: string): DecryptedCredential | null {
        const record = this._credentials.find(c => c.domain === domain);
        if (!record) return null;

        const password = this.decrypt(
            record.encryptedPassword,
            record.iv,
            record.authTag,
        );

        return { domain: record.domain, username: record.username, password };
    }

    /** Check whether credentials exist for a domain. */
    has(domain: string): boolean {
        return this._credentials.some(c => c.domain === domain);
    }

    /** Remove credentials for a domain. Returns true if found. */
    delete(domain: string): boolean {
        const idx = this._credentials.findIndex(c => c.domain === domain);
        if (idx < 0) return false;

        this._credentials.splice(idx, 1);
        this.persist();
        console.log(`[CredentialVault] Deleted credentials for "${domain}"`);
        return true;
    }

    /** List all stored domains. */
    list(): string[] {
        return this._credentials.map(c => c.domain);
    }

    // ── Encryption Internals ────────────────────────────────

    private encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this._key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const authTag = cipher.getAuthTag();

        return {
            ciphertext: encrypted,
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
        };
    }

    private decrypt(ciphertext: string, ivB64: string, authTagB64: string): string {
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        const decipher = crypto.createDecipheriv(ALGORITHM, this._key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    // ── Key Derivation ──────────────────────────────────────

    private deriveKey(passphrase: string, salt: Buffer): Buffer {
        return crypto.scryptSync(passphrase, salt, KEY_LENGTH, {
            N: SCRYPT_COST,
            r: SCRYPT_BLOCK,
            p: SCRYPT_PARALLEL,
        });
    }

    // ── Disk Persistence ────────────────────────────────────

    private persist(): void {
        // Re-read salt (and autoKey) from existing file to preserve them
        let salt: string;
        let autoKey: string | undefined;

        if (fs.existsSync(this._vaultPath)) {
            const existing: VaultFile = JSON.parse(
                fs.readFileSync(this._vaultPath, 'utf-8'),
            );
            salt = existing.salt;
            autoKey = existing.autoKey;
        } else {
            salt = crypto.randomBytes(SALT_LENGTH).toString('base64');
        }

        const vault: VaultFile = {
            salt,
            ...(autoKey ? { autoKey } : {}),
            credentials: this._credentials,
        };

        fs.writeFileSync(this._vaultPath, JSON.stringify(vault, null, 2), 'utf-8');
    }

    private writeToDisk(salt: Buffer, autoKey?: Buffer): void {
        const vault: VaultFile = {
            salt: salt.toString('base64'),
            ...(autoKey ? { autoKey: autoKey.toString('base64') } : {}),
            credentials: this._credentials,
        };

        fs.writeFileSync(this._vaultPath, JSON.stringify(vault, null, 2), 'utf-8');
    }
}
