import { ZkPolicyCompiler } from '../../domain/zk/CircuitBuilder';
import { DomainPolicy, VerificationReceipt } from '../../domain/zk/PolicyTypes';

/**
 * Orchestrates the Zero-Knowledge Policy Compilation Engine.
 * Follows DDD Application Service pattern.
 */
export class ProvingService {
    constructor() {
        // Init the WASM backend asynchronously
        ZkPolicyCompiler.initialize().catch(err => {
            console.error("Failed to initialize ZK Compiler backend:", err);
        });
    }

    /**
     * Executes the payload against the domain policy and generates the PoE claim
     */
    async generatePoE(payload: string, policy: DomainPolicy): Promise<VerificationReceipt> {
        try {
            // The compiler will throw if constraints are violated (e.g. SSN found)
            const receipt = await ZkPolicyCompiler.proveCompliance(payload, policy);
            return receipt;
        } catch (error) {
            // Map domain circuit violations to application boundaries
            throw new Error(`Execution Failed Policy Check: ${(error as Error).message}`);
        }
    }

    /**
     * Verifies an incoming PoE claim cryptographically
     */
    async verifyPoE(receipt: VerificationReceipt): Promise<boolean> {
        return await ZkPolicyCompiler.verify(receipt);
    }
}

// Export singleton for Express injection
export const provingService = new ProvingService();
