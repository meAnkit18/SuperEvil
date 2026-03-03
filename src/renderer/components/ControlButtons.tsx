interface ControlButtonsProps {
    agentState: string;
    onStart: () => void;
    onStop: () => void;
    goalEmpty: boolean;
}

function ControlButtons({ agentState, onStart, onStop, goalEmpty }: ControlButtonsProps) {
    const isRunning = agentState === 'running';

    return (
        <div className="section">
            <label className="section-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Controls
            </label>
            <div className="button-group">
                <button
                    className="btn btn-start"
                    onClick={onStart}
                    disabled={isRunning || goalEmpty}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start Agent
                </button>
                <button
                    className="btn btn-stop"
                    onClick={onStop}
                    disabled={!isRunning}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Agent
                </button>
            </div>
        </div>
    );
}

export default ControlButtons;
