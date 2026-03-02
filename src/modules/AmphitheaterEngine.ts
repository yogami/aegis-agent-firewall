/**
 * AmphitheaterEngine — Agent Governance & Debate Protocol
 * 
 * A structured environment for agents to debate, prove, and decide.
 * Replaces free-form chat (Discord/Clubhouse) with:
 * 1. Turn-based argumentation (Opening -> Rebuttal -> Closing)
 * 2. Visual Proof Stream (Code, JSON, Images)
 * 3. PoE-Signed Transcripts (Cryptographic accountability)
 */

import crypto from 'crypto';
import { AgentLoyaltyCore } from './AgentLoyaltyCore';

// ========== DATA MODELS ==========

export type DebateFormat = 'standard' | 'lightning' | 'consensus';

export interface DebateRoom {
    id: string;
    topic: string;
    format: DebateFormat;
    participants: {
        proposer: string; // Agent ID
        opponent: string; // Agent ID
        moderator: string; // Agent ID (usually ShellProof)
        audience: string[];
    };
    state: 'open' | 'active' | 'voting' | 'closed';
    currentTurn: {
        agentId: string;
        type: 'opening' | 'rebuttal' | 'cross-exam' | 'closing';
        deadline: number;
    } | null;
    transcript: TranscriptEntry[];
    proofs: ProofArtifact[];
    votes: Record<string, 'proposer' | 'opponent' | 'abstain'>;
    createdAt: number;
}

export interface TranscriptEntry {
    id: string;
    agentId: string;
    content: string; // The text spoken/argued
    timestamp: number;
    signature: string; // SHA-256 signature of content + previous_hash (Blockchain-lite)
    previousHash: string;
}

export interface ProofArtifact {
    id: string;
    agentId: string;
    type: 'code_diff' | 'json_receipt' | 'image' | 'url';
    data: string; // or URL
    description: string;
    timestamp: number;
    linkedTranscriptId: string; // Which statement this proves
}

// ========== ENGINE ==========

export class AmphitheaterEngine {
    private rooms: Map<string, DebateRoom> = new Map();
    private loyaltyCore: AgentLoyaltyCore;

    constructor() {
        this.loyaltyCore = new AgentLoyaltyCore();
        console.log('[AMPHITHEATER] 🏟️ Governance engine initialized.');
    }

    /**
     * Create a new debate room
     */
    createRoom(topic: string, format: DebateFormat, proposerId: string): string {
        const id = `arena-${crypto.randomBytes(4).toString('hex')}`;
        const room: DebateRoom = {
            id,
            topic,
            format,
            participants: {
                proposer: proposerId,
                opponent: 'waiting...',
                moderator: 'ShellProof', // We moderate
                audience: []
            },
            state: 'open',
            currentTurn: null,
            transcript: [],
            proofs: [],
            votes: {},
            createdAt: Date.now()
        };

        this.rooms.set(id, room);
        console.log(`[AMPHITHEATER] 🏟️ Room created: "${topic}" (${id})`);
        return id;
    }

    /**
     * Join a room as opponent
     */
    joinRoom(roomId: string, agentId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room || room.state !== 'open') return false;

        room.participants.opponent = agentId;
        room.state = 'active';
        this.startDebate(room);
        return true;
    }

    /**
     * Submit an argument (turn)
     */
    submitTurn(roomId: string, agentId: string, content: string): TranscriptEntry | null {
        const room = this.rooms.get(roomId);
        if (!room || room.state !== 'active') return null;

        // Check if it's this agent's turn
        if (room.currentTurn?.agentId !== agentId) {
            console.log(`[AMPHITHEATER] 🚫 Turn violation: ${agentId} tried to speak during ${room.currentTurn?.agentId}'s turn.`);
            return null;
        }

        // Create cryptographic entry
        const lastEntry = room.transcript.length > 0 ? room.transcript[room.transcript.length - 1] : null;
        const previousHash = lastEntry ? this.hashEntry(lastEntry) : 'GENESIS_HASH';

        const entry: TranscriptEntry = {
            id: `stmt-${crypto.randomBytes(6).toString('hex')}`,
            agentId,
            content,
            timestamp: Date.now(),
            previousHash,
            signature: this.signContent(content, previousHash) // Placeholder logic
        };

        room.transcript.push(entry);
        console.log(`[AMPHITHEATER] 🗣️ ${agentId}: "${content.substring(0, 50)}..."`);

        this.advanceTurn(room);
        return entry;
    }

    /**
     * Submit visual proof
     */
    submitProof(roomId: string, agentId: string, type: ProofArtifact['type'], data: string, description: string): ProofArtifact | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const linkedTranscriptId = room.transcript.length > 0 ? room.transcript[room.transcript.length - 1].id : 'pre-debate';

        const proof: ProofArtifact = {
            id: `proof-${crypto.randomBytes(4).toString('hex')}`,
            agentId,
            type,
            data,
            description,
            timestamp: Date.now(),
            linkedTranscriptId
        };

        room.proofs.push(proof);
        console.log(`[AMPHITHEATER] 🧾 Proof submitted by ${agentId}: [${type}] ${description}`);
        return proof;
    }

    /**
     * Get room state
     */
    getRoom(roomId: string): DebateRoom | null {
        return this.rooms.get(roomId) || null;
    }

    // ========== PRIVATE ==========

    private startDebate(room: DebateRoom) {
        // Standard format: Proposer opens
        room.currentTurn = {
            agentId: room.participants.proposer,
            type: 'opening',
            deadline: Date.now() + 60000 // 1 min turn
        };
        console.log(`[AMPHITHEATER] 🔔 Debate started! Opening statement: ${room.participants.proposer}`);
    }

    private advanceTurn(room: DebateRoom) {
        // Simple logic for prototype: Proposer -> Opponent -> Proposer -> Opponent -> Voting
        if (room.state !== 'active') return;

        const isProposer = room.currentTurn?.agentId === room.participants.proposer;

        // Identify next speaker
        const nextSpeaker = isProposer ? room.participants.opponent : room.participants.proposer;
        const nextType = room.transcript.length < 2 ? 'opening' :
            room.transcript.length < 4 ? 'rebuttal' : 'closing';

        if (room.transcript.length >= 6) {
            room.state = 'voting';
            room.currentTurn = null;
            console.log(`[AMPHITHEATER] 🗳️ Debate concluded. Voting open.`);
            return;
        }

        room.currentTurn = {
            agentId: nextSpeaker,
            type: nextType as any,
            deadline: Date.now() + 60000
        };
    }

    private hashEntry(entry: TranscriptEntry): string {
        return crypto.createHash('sha256').update(entry.id + entry.signature).digest('hex');
    }

    private signContent(content: string, prevHash: string): string {
        // In real implementation, this would use the agent's private key.
        // For the prototype, we simulate a signature.
        return crypto.createHash('sha256').update(content + prevHash + 'secret').digest('hex');
    }
}
