// ─── Action Logger ──────────────────────────────────────────
// Captures a screenshot and writes a structured log entry for
// every agent action.  Produces a replayable action history
// stored under  logs/<sessionId>/
// ─────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { AgentState } from './state-machine';

// ─── Log Entry Type ─────────────────────────────────────────

export interface ActionLogEntry {
    id: string;
    timestamp: number;
    state: string;             // AgentState at time of action
    action: {
        type: string;          // 'navigate', 'click', 'type', etc.
        detail: string;        // human-readable description
        success: boolean;
        error?: string;
    };
    screenshotPath: string;    // relative: screenshots/<actionId>.png
}

// ─── ActionLogger ───────────────────────────────────────────

export class ActionLogger {
    private readonly _sessionDir: string;
    private readonly _screenshotDir: string;
    private readonly _logFile: string;

    constructor(sessionId: string, baseDir?: string) {
        const root = baseDir ?? path.resolve(process.cwd(), 'logs');
        this._sessionDir = path.join(root, sessionId);
        this._screenshotDir = path.join(this._sessionDir, 'screenshots');
        this._logFile = path.join(this._sessionDir, 'action-log.jsonl');

        // Ensure directory tree exists
        fs.mkdirSync(this._screenshotDir, { recursive: true });
        console.log(`[ActionLogger] Log directory ready: ${this._sessionDir}`);
    }

    // ── Capture screenshot ──────────────────────────────────

    async captureScreenshot(page: Page, actionId: string): Promise<string> {
        const filename = `${actionId}.png`;
        const absPath = path.join(this._screenshotDir, filename);
        const relPath = path.join('screenshots', filename);

        try {
            await page.screenshot({ path: absPath, fullPage: false });
        } catch (err) {
            console.warn(
                `[ActionLogger] Screenshot failed for ${actionId}:`,
                err instanceof Error ? err.message : String(err),
            );
            // Return the path anyway — the entry will document the failure
        }

        return relPath;
    }

    // ── Write a log entry ───────────────────────────────────

    writeEntry(entry: ActionLogEntry): void {
        const line = JSON.stringify(entry) + '\n';

        try {
            fs.appendFileSync(this._logFile, line, 'utf-8');
        } catch (err) {
            console.error(
                '[ActionLogger] Failed to write log entry:',
                err instanceof Error ? err.message : String(err),
            );
        }
    }

    // ── Combined: screenshot + log ──────────────────────────

    async logAction(
        page: Page | null,
        actionId: string,
        state: AgentState,
        type: string,
        detail: string,
        success: boolean,
        error?: string,
    ): Promise<string | undefined> {
        let screenshotPath: string | undefined;

        // Capture screenshot if a page is available
        if (page && !page.isClosed()) {
            screenshotPath = await this.captureScreenshot(page, actionId);
        }

        const entry: ActionLogEntry = {
            id: actionId,
            timestamp: Date.now(),
            state,
            action: { type, detail, success, error },
            screenshotPath: screenshotPath ?? 'unavailable',
        };

        this.writeEntry(entry);
        return screenshotPath;
    }

    // ── Replay: read back all entries ───────────────────────

    getReplayLog(): ActionLogEntry[] {
        if (!fs.existsSync(this._logFile)) {
            return [];
        }

        const raw = fs.readFileSync(this._logFile, 'utf-8');
        return raw
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line) as ActionLogEntry);
    }

    // ── Directory accessors ─────────────────────────────────

    get sessionDir(): string {
        return this._sessionDir;
    }

    get logFile(): string {
        return this._logFile;
    }
}
