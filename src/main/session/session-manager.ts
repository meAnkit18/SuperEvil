import { AgentSession } from './agent-session';
import { SessionInfo } from './types';

type StatusCallback = (message: string) => void;

// ─── SessionManager ─────────────────────────────────────────
// Orchestrates session lifecycle.
// Enforces one active session at a time — creating a new session
// automatically tears down the previous one.
// ─────────────────────────────────────────────────────────────

export class SessionManager {
    private _activeSession: AgentSession | null = null;
    private _sessionHistory: SessionInfo[] = [];

    // ── Create a new session ─────────────────────────────────

    async createSession(goal: string, onStatus: StatusCallback): Promise<AgentSession> {
        // Tear down previous session if one exists
        if (this._activeSession && this._activeSession.isActive()) {
            onStatus('🔄 Stopping previous session before starting a new one...');
            const prevInfo = this._activeSession.getInfo();
            await this._activeSession.stop();
            this._sessionHistory.push(prevInfo);
        } else if (this._activeSession) {
            // Previous session is already stopped/failed — archive it
            this._sessionHistory.push(this._activeSession.getInfo());
        }

        // Create fresh session
        const session = new AgentSession(goal, onStatus);
        this._activeSession = session;

        onStatus(`📋 Session created: ${session.id}`);
        onStatus(`🎯 Goal: "${goal}"`);

        // Launch the browser
        await session.start();

        return session;
    }

    // ── Stop the active session ──────────────────────────────

    async stopSession(): Promise<void> {
        if (!this._activeSession) {
            return;
        }

        await this._activeSession.stop();
    }

    // ── Accessors ────────────────────────────────────────────

    getActiveSession(): AgentSession | null {
        return this._activeSession;
    }

    getSessionInfo(): SessionInfo | null {
        if (!this._activeSession) {
            return null;
        }
        return this._activeSession.getInfo();
    }

    getSessionHistory(): SessionInfo[] {
        return [...this._sessionHistory];
    }

    hasActiveSession(): boolean {
        return this._activeSession !== null && this._activeSession.isActive();
    }

    // ── Cleanup ──────────────────────────────────────────────

    async destroy(): Promise<void> {
        if (this._activeSession && this._activeSession.isActive()) {
            await this._activeSession.stop();
        }
        if (this._activeSession) {
            this._sessionHistory.push(this._activeSession.getInfo());
        }
        this._activeSession = null;
    }
}
