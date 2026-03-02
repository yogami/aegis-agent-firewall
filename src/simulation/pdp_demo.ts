/**
 * PDP Beacon Demo — Test PoE Discovery Protocol
 * 
 * Run: npx ts-node src/simulation/pdp_demo.ts
 */

import { GossipBeacon, PoEBeacon, PDP_TOPICS } from '../modules/GossipBeacon';

async function main() {
    console.log('=== PDP Phase 1 Demo ===\n');

    // Create two beacon nodes (simulating multi-agent discovery)
    const node1 = new GossipBeacon('openclaw-node-v4-op');
    const node2 = new GossipBeacon('agent-security-auditor');

    // Start both nodes
    await node1.start();
    await node2.start();

    // Node 1 listens for beacons
    node1.onBeacon((beacon: PoEBeacon) => {
        console.log(`\n[NODE-1] 🔔 Discovered peer via beacon!`);
        console.log(`         Match: ${beacon.nodeId} (veracity: ${beacon.veracityScore})`);
    });

    // Node 2 listens for beacons
    node2.onBeacon((beacon: PoEBeacon) => {
        console.log(`\n[NODE-2] 🔔 Discovered peer via beacon!`);
        console.log(`         Match: ${beacon.nodeId} (veracity: ${beacon.veracityScore})`);
    });

    console.log('\n--- Broadcasting PoE Beacons ---\n');

    // Node 1 beacons a PoE hash (from recent config hardening work)
    const beacon1 = await node1.beacon(
        '15bc33fc025244a735ab28729f01f53a39360323d37e0714a1ef87eafb762563',
        ['config-hardening', 'security-refactor'],
        { tier: 3, success: true, duration_s: 180 }
    );

    // Simulate Node 2 receiving Node 1's beacon
    node2.simulateIncomingBeacon(beacon1);

    console.log('\n--- Node 2 responds with its own beacon ---\n');

    // Node 2 beacons its own PoE
    const beacon2 = await node2.beacon(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
        ['security-audit', 'vulnerability-scan'],
        { tier: 3, success: true, duration_s: 300 }
    );

    // Simulate Node 1 receiving Node 2's beacon
    node1.simulateIncomingBeacon(beacon2);

    console.log('\n--- Discovery Complete ---');
    console.log(`Node 1 Veracity: ${node1.getVeracity()}`);
    console.log(`Node 2 Veracity: ${node2.getVeracity()}`);

    // Stop nodes
    await node1.stop();
    await node2.stop();

    console.log('\n✅ PDP Demo Complete\n');
}

main().catch(console.error);
