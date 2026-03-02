export interface DomainPolicy {
    policyId: string;
    description: string;
    maxPayloadLength: number;
    bannedSequenceLength: number;
}

export interface VerificationReceipt {
    publicInputHash: string;
    snarkProof: string; // Base64 encoded simulated proof block
    policyId: string;
}
