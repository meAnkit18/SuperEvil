import { useState, useEffect, useCallback } from 'react';
import GoalInput from './components/GoalInput';
import ControlButtons from './components/ControlButtons';
import StatusDisplay from './components/StatusDisplay';
import './types';

type AgentState = 'idle' | 'running' | 'paused' | 'error' | 'waiting_human';

function App() {
    const [goal, setGoal] = useState('');
    const [agentState, setAgentState] = useState<AgentState>('idle');
    const [logs, setLogs] = useState<string[]>([
        '[System] SuperEvil Agent initialized',
        '[System] Waiting for goal input...',
    ]);

    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    }, []);

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
                await window.superevil.startAgent(goal);
            }
            addLog('✅ Agent is now running');
        } catch (err) {
            addLog(`❌ Failed to start agent: ${err}`);
            setAgentState('error');
        }
    };

    const handleStop = async () => {
        addLog('🛑 Stopping agent...');
        try {
            if (window.superevil) {
                await window.superevil.stopAgent();
            }
            setAgentState('idle');
            addLog('⏹ Agent stopped');
        } catch (err) {
            addLog(`❌ Failed to stop agent: ${err}`);
        }
    };

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

                {/* Footer */}
                <div className="panel-footer">
                    <span className="footer-text">Phase 1 • Desktop Shell</span>
                </div>
            </div>
        </div>
    );
}

export default App;
