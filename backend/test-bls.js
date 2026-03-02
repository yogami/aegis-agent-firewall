import crypto from 'crypto';
import { bls12_381 } from '@noble/curves/bls12-381.js';

async function testBLSMath() {
    console.log("==========================================");
    console.log("🛡️  AEGIS TRUE BLS12-381 BENCHMARK TEST 🛡️");
    console.log("==========================================\n");

    const payload = {
        method: "PUT",
        endpoint: "/aws/rds/cluster/snapshot-retention",
        body: { snapshot_retention_days: 0 },
        intent: "Ransomware Void_0x attack vector"
    };

    // Convert payload to Uint8Array for signing
    const messageBytes = crypto.createHash('sha256').update(JSON.stringify(payload)).digest();

    console.log(`[TEST] Simulating 3 Node Approvals (Quorum) for intent: ${payload.endpoint}\n`);

    const bls = bls12_381.shortSignatures;

    // Generate 3 Guardians
    const key1 = bls12_381.utils.randomSecretKey();
    const pub1 = bls.getPublicKey(key1);

    const key2 = bls12_381.utils.randomSecretKey();
    const pub2 = bls.getPublicKey(key2);

    const key3 = bls12_381.utils.randomSecretKey();
    const pub3 = bls.getPublicKey(key3);

    console.log("[TEST] Generating mathematically true BLS12-381 Signatures...");
    // Map the raw message bytes mathematically to a point on the BLS12-381 curve
    const curveMessage = bls.hash(messageBytes);
    // Each node signs the EXACT SAME message point independently (Non-Interactive)
    const sig1 = bls.sign(curveMessage, key1);
    const sig2 = bls.sign(curveMessage, key2);
    const sig3 = bls.sign(curveMessage, key3);

    console.log(`\nGuardian 1 Shard: \${Buffer.from(sig1).toString('hex').substring(0, 32)}...`);
    console.log(`Guardian 2 Shard: \${Buffer.from(sig2).toString('hex').substring(0, 32)}...`);
    console.log(`Guardian 3 Shard: \${Buffer.from(sig3).toString('hex').substring(0, 32)}...\n`);

    console.log("[TEST] Aggregating via True BLS Point Addition...");

    // The Gateway non-interactively aggregates the signatures AND the public keys
    const aggregatedSignature = bls.aggregateSignatures([sig1, sig2, sig3]);
    const aggregatedPublicKey = bls.aggregatePublicKeys([pub1, pub2, pub3]);

    // The final verification checks the 1 aggregated signature against the 1 aggregated public key
    const isValid = bls.verify(aggregatedSignature, curveMessage, aggregatedPublicKey);

    if (isValid) {
        console.log("✅ MATHEMATICAL PROOF SUCCESSFUL ✅");
        console.log("The Gateway successfully aggregated 3 independent BLS signatures into a single proof.");
        console.log("Zero nonces. Zero network interactivity. Infinite scalability.");
    } else {
        console.log("❌ MATHEMATICAL PROOF FAILED ❌");
    }
}

testBLSMath();
