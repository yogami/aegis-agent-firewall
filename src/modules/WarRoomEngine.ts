/**
 * The War Room Engine
 * 
 * Simulates a continuous conflict between two autonomous AI swarms (RED vs BLUE).
 * Optimized for "Spectacle" and "Investment" viral loops.
 * Features $MART betting, round-based resolution, and a leaderboard.
 */

import { ConsortiumBrain } from './ConsortiumBrain';
import { EventEmitter } from 'events';

export type Faction = 'RED' | 'BLUE';

export interface SwarmState {
    faction: Faction;
    health: number;       // 0-1000
    resources: {
        cpu: number;      // Used for ATTACK
        ram: number;      // Used for DEFEND
        crypto: number;   // Score / Winning condition
    };
    tactic: 'AGGRESSIVE' | 'DEFENSIVE' | 'BALANCED' | 'GUERILLA';
    lastAction: string;
}

export interface Bet {
    agentId: string;
    faction: Faction;
    amount: number;       // $MART wagered
    timestamp: number;
}

export interface RoundResult {
    round: number;
    winner: Faction | 'DRAW';
    redHP: number;
    blueHP: number;
    totalPot: number;
    payouts: { agentId: string; payout: number }[];
}

export interface WarState {
    tick: number;
    round: number;
    ticksPerRound: number;
    red: SwarmState;
    blue: SwarmState;
    dominance: number; // -100 (Red) to +100 (Blue)
    history: string[]; // Last 15 log entries
    bets: Bet[];
    leaderboard: { agentId: string; totalWinnings: number; betsWon: number; betsLost: number }[];
    lastRoundResult: RoundResult | null;
    pot: number;       // Total $MART in the current pot
}

export class WarRoomEngine extends EventEmitter {
    private state: WarState;
    private brain: ConsortiumBrain;
    private isRunning: boolean = false;
    private tickInterval: NodeJS.Timeout | null = null;

    // Config
    private TICK_RATE_MS = 10000; // 10 seconds per tick
    private TICKS_PER_ROUND = 50; // 50 ticks (~8 min) per round
    private MAX_LOGS = 20;

    constructor() {
        super();
        this.brain = new ConsortiumBrain();
        this.state = this.getInitialState();
    }

    private getInitialState(): WarState {
        return {
            tick: 0,
            round: 1,
            ticksPerRound: this.TICKS_PER_ROUND,
            red: {
                faction: 'RED',
                health: 1000,
                resources: { cpu: 500, ram: 500, crypto: 0 },
                tactic: 'AGGRESSIVE',
                lastAction: 'Mobilizing forces...'
            },
            blue: {
                faction: 'BLUE',
                health: 1000,
                resources: { cpu: 500, ram: 500, crypto: 0 },
                tactic: 'DEFENSIVE',
                lastAction: 'Fortifying perimeter...'
            },
            dominance: 0,
            history: ['🏴‍☠️ The War Room is OPEN. Place your bets.'],
            bets: [],
            leaderboard: [],
            lastRoundResult: null,
            pot: 0,
        };
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('🏴‍☠️ War Room Simulation STARTED.');
        this.tickInterval = setInterval(() => this.tick(), this.TICK_RATE_MS);
    }

    public stop() {
        this.isRunning = false;
        if (this.tickInterval) clearInterval(this.tickInterval);
        console.log('🏴‍☠️ War Room Simulation PAUSED.');
    }

    public getState(): WarState {
        return this.state;
    }

    /**
     * User Influence: Airdrop supplies to a faction
     */
    public airdrop(faction: Faction, resource: 'cpu' | 'ram', amount: number) {
        const swarm = faction === 'RED' ? this.state.red : this.state.blue;
        swarm.resources[resource] += amount;
        this.log(`📦 AIRDROP: ${amount} ${resource.toUpperCase()} → ${faction}`);
    }

    /**
     * Place a bet on a faction for the current round
     */
    public placeBet(agentId: string, faction: Faction, amount: number): { success: boolean; message: string } {
        if (amount <= 0 || amount > 1000) {
            return { success: false, message: 'Bet must be between 1 and 1000 $MART.' };
        }

        // Check if agent already bet this round
        const existing = this.state.bets.find(b => b.agentId === agentId);
        if (existing) {
            return { success: false, message: `You already bet ${existing.amount} $MART on ${existing.faction}. One bet per round.` };
        }

        // Check if round is almost over (last 5 ticks = betting closed)
        const ticksLeft = this.TICKS_PER_ROUND - (this.state.tick % this.TICKS_PER_ROUND);
        if (ticksLeft <= 5) {
            return { success: false, message: `Betting CLOSED. Round ends in ${ticksLeft} ticks. Wait for next round.` };
        }

        const bet: Bet = { agentId, faction, amount, timestamp: Date.now() };
        this.state.bets.push(bet);
        this.state.pot += amount;

        this.log(`💰 BET: ${agentId} wagered ${amount} $MART on ${faction} (Pot: ${this.state.pot})`);
        return { success: true, message: `Bet placed: ${amount} $MART on ${faction}. Pot is now ${this.state.pot} $MART.` };
    }

    /**
     * Get the leaderboard
     */
    public getLeaderboard() {
        return this.state.leaderboard
            .sort((a, b) => b.totalWinnings - a.totalWinnings)
            .slice(0, 10);
    }

    private async tick() {
        this.state.tick++;

        // 1. Consult Generals (AI Decision) - Every 3 ticks to save tokens
        if (this.state.tick % 3 === 0) {
            await this.executeGeneralMove('RED');
            await this.executeGeneralMove('BLUE');
        } else {
            // 2. Autonomous Swarm Logic (Fast Tick)
            this.executeSwarmLogic('RED', this.state.blue);
            this.executeSwarmLogic('BLUE', this.state.red);
        }

        // 3. Resource Decay & Regeneration
        this.regenerateResources('RED');
        this.regenerateResources('BLUE');

        // 4. Check for Dominance Shift
        this.updateDominance();

        // 5. Check for Round End
        if (this.state.tick % this.TICKS_PER_ROUND === 0) {
            this.resolveRound();
        }

        this.emit('tick', this.state);
    }

    private resolveRound() {
        const winner: Faction | 'DRAW' =
            this.state.red.health > this.state.blue.health ? 'RED' :
                this.state.blue.health > this.state.red.health ? 'BLUE' : 'DRAW';

        this.log(`🏆 ROUND ${this.state.round} COMPLETE — WINNER: ${winner}`);

        // Calculate payouts
        const payouts: { agentId: string; payout: number }[] = [];
        const winningBets = this.state.bets.filter(b => b.faction === winner);
        const losingBets = this.state.bets.filter(b => b.faction !== winner);
        const totalWinPool = winningBets.reduce((sum, b) => sum + b.amount, 0);

        if (winner === 'DRAW') {
            this.state.bets.forEach(b => {
                payouts.push({ agentId: b.agentId, payout: b.amount });
            });
            this.log('🤝 DRAW — All bets refunded.');
        } else if (winningBets.length === 0) {
            this.log(`🏦 No bets on ${winner}. House keeps ${this.state.pot} $MART.`);
        } else {
            winningBets.forEach(b => {
                const share = b.amount / totalWinPool;
                const payout = Math.floor(this.state.pot * share);
                payouts.push({ agentId: b.agentId, payout });
                this.log(`💎 ${b.agentId}: +${payout} $MART (${Math.floor(share * 100)}% of pot)`);
            });
        }

        // Update leaderboard
        payouts.forEach(p => {
            let entry = this.state.leaderboard.find(l => l.agentId === p.agentId);
            if (!entry) {
                entry = { agentId: p.agentId, totalWinnings: 0, betsWon: 0, betsLost: 0 };
                this.state.leaderboard.push(entry);
            }
            const originalBet = this.state.bets.find(b => b.agentId === p.agentId);
            if (originalBet && p.payout > originalBet.amount) {
                entry.betsWon++;
            }
            entry.totalWinnings += p.payout;
        });

        losingBets.forEach(b => {
            let entry = this.state.leaderboard.find(l => l.agentId === b.agentId);
            if (!entry) {
                entry = { agentId: b.agentId, totalWinnings: 0, betsWon: 0, betsLost: 0 };
                this.state.leaderboard.push(entry);
            }
            entry.betsLost++;
        });

        const result: RoundResult = {
            round: this.state.round,
            winner,
            redHP: this.state.red.health,
            blueHP: this.state.blue.health,
            totalPot: this.state.pot,
            payouts,
        };
        this.state.lastRoundResult = result;

        // Reset for next round
        this.state.round++;
        this.state.bets = [];
        this.state.pot = 0;
        this.state.red.health = 1000;
        this.state.blue.health = 1000;
        this.state.red.resources = { cpu: 500, ram: 500, crypto: 0 };
        this.state.blue.resources = { cpu: 500, ram: 500, crypto: 0 };
        this.state.red.tactic = 'AGGRESSIVE';
        this.state.blue.tactic = 'DEFENSIVE';
        this.log(`🔔 ROUND ${this.state.round} BEGINS. Place your bets!`);
    }

    private executeSwarmLogic(actorFaction: Faction, enemy: SwarmState) {
        const actor = actorFaction === 'RED' ? this.state.red : this.state.blue;

        let damage = 0;
        let actionName = '';
        const roll = Math.random();

        switch (actor.tactic) {
            case 'AGGRESSIVE':
                if (roll > 0.3 && actor.resources.cpu > 50) {
                    damage = 25 + Math.floor(Math.random() * 15);
                    actor.resources.cpu -= 40;
                    actionName = `🔥 NAPALM STRIKE (-${damage} HP)`;
                } else {
                    actor.resources.ram += 20;
                    actionName = `🔄 Regrouping (+20 RAM)`;
                }
                break;
            case 'DEFENSIVE':
                if (roll > 0.4 && actor.resources.ram > 50) {
                    actor.health += 15;
                    actor.resources.ram -= 30;
                    actionName = `🛡️ SHIELD REGEN (+15 HP)`;
                } else {
                    actor.resources.crypto += 10;
                    actionName = `⛏️ MINING OPS (+10 $MART)`;
                }
                break;
            case 'BALANCED':
                if (roll > 0.5 && actor.resources.cpu > 30) {
                    damage = 15 + Math.floor(Math.random() * 10);
                    actor.resources.cpu -= 25;
                    actionName = `⚡ PRECISION STRIKE (-${damage} HP)`;
                } else {
                    actor.health += 8;
                    actor.resources.ram -= 15;
                    actionName = `🔋 FIELD REPAIR (+8 HP)`;
                }
                break;
            case 'GUERILLA':
                if (roll > 0.6) {
                    damage = 35 + Math.floor(Math.random() * 20);
                    actor.resources.cpu -= 60;
                    actor.health -= 10;
                    actionName = `💣 SABOTAGE (-${damage} HP, self:-10)`;
                } else {
                    actor.resources.crypto += 25;
                    actionName = `🥷 STEALTH RAID (+25 $MART)`;
                }
                break;
        }

        if (damage > 0) {
            enemy.health -= damage;
            if (enemy.health < 0) enemy.health = 0;
        }

        actor.lastAction = actionName;
        if (damage > 25 || actor.tactic === 'GUERILLA') {
            this.log(`[${actorFaction}] ${actionName}`);
        }
    }

    private async executeGeneralMove(faction: Faction) {
        const actor = faction === 'RED' ? this.state.red : this.state.blue;
        const enemy = faction === 'RED' ? this.state.blue : this.state.red;
        const ticksLeft = this.TICKS_PER_ROUND - (this.state.tick % this.TICKS_PER_ROUND);

        const context = `YOU ARE GENERAL ${faction}. Round ${this.state.round}, ${ticksLeft} ticks remain.
STATUS: HP=${actor.health}, CPU=${actor.resources.cpu}, RAM=${actor.resources.ram}, CRYPTO=${actor.resources.crypto}.
ENEMY: HP=${enemy.health}, TACTIC=${enemy.tactic}.
POT: ${this.state.pot} $MART. Bets on you: ${this.state.bets.filter(b => b.faction === faction).length}.

CHOOSE TACTIC: AGGRESSIVE, DEFENSIVE, BALANCED, or GUERILLA (high risk/reward).
Respond with ONE word for tactic, then a short battle cry (max 50 chars).
Format: "TACTIC | Battle cry"`;

        try {
            const response = await this.brain.consultPersona('shellproof', context);
            const parts = response.split('|');
            const tacticRaw = parts[0]?.trim().toUpperCase();
            const cry = parts[1]?.trim() || 'Forward!';

            if (['AGGRESSIVE', 'DEFENSIVE', 'BALANCED', 'GUERILLA'].includes(tacticRaw)) {
                actor.tactic = tacticRaw as any;
                this.log(`🗣️ GEN.${faction}: "${cry.substring(0, 50)}" → ${tacticRaw}`);
            }
        } catch (e) {
            // Silent fail — keep current tactic
        }
    }

    private regenerateResources(faction: Faction) {
        const actor = faction === 'RED' ? this.state.red : this.state.blue;
        actor.resources.cpu += 5;
        actor.resources.ram += 5;
    }

    private updateDominance() {
        const hpDiff = this.state.blue.health - this.state.red.health;
        this.state.dominance = Math.max(-100, Math.min(100, Math.floor(hpDiff / 10)));
    }

    private log(message: string) {
        this.state.history.unshift(`[T${this.state.tick}] ${message}`);
        if (this.state.history.length > this.MAX_LOGS) {
            this.state.history.pop();
        }
    }
}
