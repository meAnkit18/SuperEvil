interface GoalInputProps {
    goal: string;
    setGoal: (goal: string) => void;
    disabled: boolean;
}

function GoalInput({ goal, setGoal, disabled }: GoalInputProps) {
    return (
        <div className="section">
            <label className="section-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                </svg>
                Mission Goal
            </label>
            <textarea
                className="goal-textarea"
                placeholder="Describe your goal...&#10;&#10;e.g. Go to Amazon, search for 'mechanical keyboard', filter by 4+ stars, and add the cheapest one to cart."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={disabled}
                rows={5}
            />
        </div>
    );
}

export default GoalInput;
