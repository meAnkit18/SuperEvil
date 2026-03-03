// ─── Gemini Planner ─────────────────────────────────────────
// Extends TacticalPlanner with Google Gemini API integration.
// Overrides the callLLM() stub to make real API calls using
// the @google/generative-ai SDK.
// ─────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';
import { TacticalPlanner } from './tactical-planner';
import { PlannerConfig } from './types';

export class GeminiPlanner extends TacticalPlanner {
    private readonly _genAI: GoogleGenerativeAI;
    private readonly _modelName: string;

    constructor(config?: Partial<PlannerConfig>, modelName?: string) {
        super(config);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error(
                'GEMINI_API_KEY is not set. ' +
                'Create a .env file in the project root with: GEMINI_API_KEY=your_key_here',
            );
        }

        this._genAI = new GoogleGenerativeAI(apiKey);
        this._modelName = modelName ?? 'gemini-2.0-flash';

        console.log(`[GeminiPlanner] Initialized with model: ${this._modelName}`);
    }

    // ── LLM Call Implementation ─────────────────────────────
    // Sends the system + user prompts to Gemini and returns
    // the raw text response for validation.

    protected override async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
        console.log(`[GeminiPlanner] Calling Gemini (${this._modelName})...`);

        const model = this._genAI.getGenerativeModel({
            model: this._modelName,
            systemInstruction: systemPrompt,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 512,
                responseMimeType: 'application/json',
            },
        });

        const result = await model.generateContent(userPrompt);
        const response = result.response;
        const text = response.text();

        console.log(`[GeminiPlanner] Gemini response (${text.length} chars)`);

        return text;
    }
}
