import { useState, useEffect, useCallback, useRef } from 'react';
import GoalInput from './components/GoalInput';
import ControlButtons from './components/ControlButtons';
import StatusDisplay from './components/StatusDisplay';
import './types';
import type { SessionInfo } from './types';

type AgentState = 'idle' | 'running' | 'paused' | 'error' | 'waiting_human';

function App() {
    const [goal, setGoal] = useState('');
    const [agentState, setAgentState] = useState<AgentState>('idle');
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
    const [logs, setLogs] = useState<string[]>([
        '[System] SuperEvil Agent initialized',
        '[System] Waiting for goal input...',
    ]);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    }, []);

    // Poll session info while agent is running
    useEffect(() => {
        if (agentState === 'running' && window.superevil) {
            const poll = () => {
                window.superevil.getSessionInfo().then((info) => {
                    if (info) setSessionInfo(info);
                });
            };
            poll(); // immediate first poll
            pollRef.current = setInterval(poll, 2000);
        } else {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [agentState]);

    useEffect(() => {
        if (window.superevil) {
            window.superevil.onStatusUpdate((status: string) => {
                addLog(status);
            });
        }
        return () => {
            if (window.superevil) {
                window.superevil.removeStatusListener();
            }
        };
    }, [addLog]);

    const handleStart = async () => {
        if (!goal.trim()) return;
        setAgentState('running');
        addLog(`🚀 Agent starting with goal: "${goal}"`);
        try {
            if (window.superevil) {
                const result = await window.superevil.startAgent(goal);
                if (result.status === 'error') {
                    addLog(`❌ ${result.message || 'Unknown error'}`);
                    setAgentState('error');
                } else {
                    addLog(`✅ Session ${result.sessionId} — Chromium window opened`);
                }
            }
        } catch (err) {
            addLog(`❌ Failed to start agent: ${err}`);
            setAgentState('error');
        }
    };

    const handleStop = async () => {
        addLog('🛑 Stopping agent...');
        try {
            if (window.superevil) {
                const result = await window.superevil.stopAgent();
                if (result.status === 'error') {
                    addLog(`⚠️ ${result.message || 'Unknown error'}`);
                }
                // Fetch final session snapshot
                const info = await window.superevil.getSessionInfo();
                if (info) setSessionInfo(info);
            }
            setAgentState('idle');
            addLog('⏹ Agent stopped — session ended');
        } catch (err) {
            addLog(`❌ Failed to stop agent: ${err}`);
        }
    };

    // ── Footer label ─────────────────────────────────────────
    const footerLabel = sessionInfo
        ? `Session ${sessionInfo.id} • ${sessionInfo.state} • ${sessionInfo.actionCount} action${sessionInfo.actionCount !== 1 ? 's' : ''}`
        : 'Phase 3 • Session Control';

    return (
        <div className="app-container">
            {/* Decorative background elements */}
            <div className="bg-glow bg-glow-1" />
            <div className="bg-glow bg-glow-2" />

            <div className="control-panel">
                {/* Header */}
                <div className="panel-header">
                    <div className="logo-section">
                        <div className="logo-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                                <path d="M2 12h20" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="logo-title">SuperEvil</h1>
                            <span className="logo-subtitle">Autonomous Agent</span>
                        </div>
                    </div>
                    <div className={`status-badge status-badge--${agentState}`}>
                        <span className="status-dot" />
                        {agentState === 'idle' && 'Idle'}
                        {agentState === 'running' && 'Running'}
                        {agentState === 'paused' && 'Paused'}
                        {agentState === 'error' && 'Error'}
                        {agentState === 'waiting_human' && 'Needs Input'}
                    </div>
                </div>

                {/* Goal Input */}
                <GoalInput goal={goal} setGoal={setGoal} disabled={agentState === 'running'} />

                {/* Controls */}
                <ControlButtons
                    agentState={agentState}
                    onStart={handleStart}
                    onStop={handleStop}
                    goalEmpty={!goal.trim()}
                />

                {/* Status / Logs */}
                <StatusDisplay logs={logs} />

                {/* Footer — live session info */}
                <div className="panel-footer">
                    <span className="footer-text">{footerLabel}</span>
                </div>
            </div>
        </div>
    );
}

export default App;
