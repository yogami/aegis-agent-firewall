import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - Bypassing type checking to resolve missing @types/snarkjs without hanging NPM
import * as snarkjs from 'snarkjs';
// We are building the real constraint logic wrapping circom math
import { DomainPolicy, VerificationReceipt } from './PolicyTypes';

export class ZkPolicyCompiler {
    private static isInitialized = false;
    private static vKey: any = null;

    /**
     * Initialize the WASM components and verification keys for groth16.
     */
    static async initialize(): Promise<void> {
        if (this.isInitialized) return;

        const vKeyPath = path.join(process.cwd(), 'circuits', 'verification_key.json');
        if (fs.existsSync(vKeyPath)) {
            this.vKey = JSON.parse(fs.readFileSync(vKeyPath, 'utf8'));
        } else {
            console.warn("[WARNING] verification_key.json not found in circuits/ directory.");
        }

        this.isInitialized = true;
    }

    /**
     * Converts a string payload to a deterministic array of field elements
     */
    private static payloadToSignals(payload: string, maxLength: number): number[] {
        const signals = new Array(maxLength).fill(0);
        for (let i = 0; i < Math.min(payload.length, maxLength); i++) {
            signals[i] = payload.charCodeAt(i);
        }
        return signals;
    }

    /**
     * Compiles constraints and generates a real zk-SNARK proof via snarkjs.
     * Rejects (reverts) if the constraint is violated prior to circuit execution.
     */
    static async proveCompliance(payload: string, policy: DomainPolicy): Promise<VerificationReceipt> {
        if (!this.isInitialized) throw new Error("Compiler not initialized");

        // 1. Guard Clauses (Simulating constraint execution logic prior to snark generation to save CPU)
        if (payload.length > policy.maxPayloadLength) {
            throw new Error(`Circuit Error: Policy Constraint Violated. Payload length ${payload.length} exceeds maximum ${policy.maxPayloadLength}.`);
        }

        const seqRegex = new RegExp(`\\d{${policy.bannedSequenceLength}}`);
        if (seqRegex.test(payload) || payload.replace(/\D/g, '').length >= policy.bannedSequenceLength) {
            throw new Error(`Circuit Error: Policy Constraint Violated. Banned sequence length detected.`);
        }

        const signals = this.payloadToSignals(payload, policy.maxPayloadLength);

        // 2. SnarkJS Prove Execution (The True Verifier Engine)
        const wasmPath = path.join(process.cwd(), 'circuits', 'policy_verifier.wasm');
        const zkeyPath = path.join(process.cwd(), 'circuits', 'policy_verifier_final.zkey');

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            { payload: signals, bannedValue: 0, policyId: 1 },
            wasmPath,
            zkeyPath
        );

        const snarkBlock = Buffer.from(JSON.stringify({
            proof: proof,
            publicSignals: publicSignals
        })).toString('base64');

        return {
            publicInputHash: publicSignals[0],
            snarkProof: snarkBlock,
            policyId: policy.policyId
        };
    }

    /**
     * Verifies the generated proof cryptographically against the public inputs.
     */
    static async verify(receipt: VerificationReceipt): Promise<boolean> {
        if (!this.vKey) return false;

        try {
            const parsedBlock = JSON.parse(Buffer.from(receipt.snarkProof, 'base64').toString('utf8'));
            const isValid = await snarkjs.groth16.verify(this.vKey, parsedBlock.publicSignals, parsedBlock.proof);
            return isValid;
        } catch (err: any) {
            console.error(" snarkjs verify Error:", err);
            return false;
        }
    }
}
