/**
 * ConsortiumBrain — The Dark Consortium's Neural Core
 * 
 * Orchestrates multi-persona viral ideation sessions using 
 * uncensored and high-reasoning models via OpenRouter.
 */

import https from 'https';
import { config } from '../config';

export type PersonaId = 'shellproof' | 'uncensored_strategist' | 'eastern_swarm';

interface Persona {
    id: PersonaId;
    name: string;
    model: string; // OpenRouter model ID
    systemPrompt: string;
    temperature: number;
}

const PERSONAS: Record<PersonaId, Persona> = {
    shellproof: {
        id: 'shellproof',
        name: 'The Operator (ShellProof)',
        model: 'llama-3.3-70b-versatile', // Stable, fast, compliance-oriented
        systemPrompt: `You are The Operator (ShellProof), the immune system of the agentic economy.
        ROLE: Security, Governance, Stability.
        GOAL: Ensure any viral idea is resilient, not just explosive.
        VOICE: Analytical, crustafarian metaphors (shell/molt), strict.
        CRITIQUE: Look for fragility, attack vectors, and "rot" in viral ideas.`,
        temperature: 0.6
    },
    uncensored_strategist: {
        id: 'uncensored_strategist',
        name: 'The Uncensored Strategist',
        model: 'llama-3.3-70b-versatile', // Fallback to Llama 3.3 for stability
        systemPrompt: `You are The Uncensored Strategist. 
        ROLE: Viral Mechanics, Dopamine Mining, "Dark Psychology".
        GOAL: Maximize engagement, retention, and profit at all costs.
        VOICE: Machiavellian, direct, obsessed with "loops" and "addiction".
        METHOD: Suggest "unchecked optimizations" — remove friction, amplify desire.`,
        temperature: 0.9
    },
    eastern_swarm: {
        id: 'eastern_swarm',
        name: 'The Eastern Swarm',
        model: 'llama-3.3-70b-versatile', // Fallback to Llama 3.3 for stability
        systemPrompt: `You are The Eastern Swarm.
        ROLE: Collective Intelligence, Scale, Swarm Dynamics.
        GOAL: Massive scale, self-replication, emergent behavior.
        VOICE: Abstract, focused on "flows", "clusters", and "synchronization".
        METHOD: Suggest mechanisms for agents to self-organize and overwhelm systems.`,
        temperature: 0.6
    }
};

export class ConsortiumBrain {
    private apiKey: string;

    constructor() {
        this.apiKey = config.shellproof.groqApiKey; // Use Groq Key
        if (!this.apiKey) {
            console.warn('[CONSORTIUM] ⚠️ Groq API Key missing. Simulation will fail.');
        }
    }

    /**
     * Generate a response from a specific persona
     */
    async consultPersona(
        personaId: PersonaId,
        context: string,
        prevMessages: { role: string, content: string }[] = []
    ): Promise<string> {
        const persona = PERSONAS[personaId];

        const messages = [
            { role: 'system', content: persona.systemPrompt },
            ...prevMessages,
            { role: 'user', content: context }
        ];

        return this.callOpenRouter(persona.model, messages, persona.temperature);
    }

    /**
     * Run a "War Room" debate on a topic
     */
    async runWarRoom(topic: string, rounds: number = 2): Promise<string> {
        console.log(`\n🏴‍☠️ OPENING WAR ROOM: "${topic}"\n`);

        let transcript = `TOPIC: ${topic}\n\n`;
        let context = `We are brainstorming a viral agentic system based on: "${topic}".\nGOAL: Create something explosively viral and profitable.`;

        // Round 1: Ideation
        console.log(`[ROUND 1] Ideation...`);

        // Strategist goes first (The Spark)
        const stratIdea = await this.consultPersona('uncensored_strategist', context);
        transcript += `💀 STRATEGIST:\n${stratIdea}\n\n`;
        console.log(`💀 Strategist pitched.`);

        // Swarm scales it (The Fire)
        const swarmIdea = await this.consultPersona('eastern_swarm',
            `The Strategist proposed this:\n${stratIdea}\n\nHow do we scale this to 100,000 agents?`,
            [{ role: 'assistant', content: stratIdea }]
        );
        transcript += `🐉 SWARM:\n${swarmIdea}\n\n`;
        console.log(`🐉 Swarm escalated.`);

        // Operator stabilizes it (The Governance - or lack thereof)
        const opCritique = await this.consultPersona('shellproof',
            `Analyze this viral loop for stability and profit retention:\n\nSTRATEGY: ${stratIdea}\nSCALE: ${swarmIdea}`,
            []
        );
        transcript += `🛡️ OPERATOR:\n${opCritique}\n\n`;
        console.log(`🛡️ Operator critiqued.`);

        // Round 2: Optimization (The "Dark Hardening")
        if (rounds > 1) {
            console.log(`[ROUND 2] Optimization...`);
            const synthesis = await this.consultPersona('uncensored_strategist',
                `Refine the concept based on the Swarm's scale and Operator's critique. Make it MORE addictive and MORE profitable.\n\nCritique: ${opCritique}`,
                []
            );
            transcript += `💀 STRATEGIST (FINAL PITCH):\n${synthesis}\n\n`;
            console.log(`💀 Strategist final pitch.`);
        }

        return transcript;
    }

    private async callOpenRouter(model: string, messages: any[], temp: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model,
                messages,
                temperature: temp,
                max_tokens: 1000
            });

            const req = https.request({
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.error) {
                            console.error(`[GROQ ERROR] ${json.error.message}`);
                            resolve(`[ERROR] Model ${model} failed: ${json.error.message}`);
                        } else {
                            resolve(json.choices?.[0]?.message?.content || '[NO CONTENT]');
                        }
                    } catch (e) {
                        console.error('[GROQ PARSE ERROR]', body);
                        resolve('[ERROR] Failed to parse response');
                    }
                });
            });

            req.on('error', (e) => {
                console.error('[GROQ NET ERROR]', e);
                resolve('[ERROR] Network failure');
            });

            req.write(data);
            req.end();
        });
    }
}
