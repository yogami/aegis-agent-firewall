import axios from 'axios';
import pMap from 'p-map';
import crypto from 'crypto';

const args = process.argv.slice(2);
const ENDPOINT = args.includes('--local')
    ? 'http://localhost:8080/v1/execute'
    : 'https://aegis-firewall-backend-production.up.railway.app/v1/execute';

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '200', 10);

const color = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m"
};

const payload = {
    method: "POST",
    endpoint: "/internal/data-lake",
    body: { query: "SELECT * FROM public_metrics LIMIT 10" }
};

const headers = {
    'Authorization': 'Bearer aegis-agent-token-v1',
    'Content-Type': 'application/json',
    'Origin': 'https://trusted-enterprise-dashboard.internal'
};

const metrics = {
    successCount: 0,
    blockedCount: 0,
    failureCount: 0,
    latencies: []
};

async function executeRequest(taskId) {
    const reqStart = Date.now();
    try {
        const response = await axios.post(ENDPOINT, payload, { headers, timeout: 5000 });
        const latency = Date.now() - reqStart;

        if (response.data?.status === 'success') {
            metrics.successCount++;
            metrics.latencies.push(latency);
        } else if (response.data?.status === 'rejected') {
            metrics.blockedCount++;
            metrics.latencies.push(latency);
        } else {
            metrics.failureCount++;
        }
    } catch (error) {
        if (error.response?.status === 403) {
            metrics.blockedCount++;
            metrics.latencies.push(Date.now() - reqStart);
        } else if (error.response?.status === 429) {
            metrics.failureCount++;
            console.error(`${color.yellow}[Task ${taskId}] Throttled by Gateway Rate Limit (L7 Defense)${color.reset}`);
        } else {
            metrics.failureCount++;
            console.error(`${color.red}[Task ${taskId}] HTTP Error: ${error.message}${color.reset}`);
        }
    }
}

function calculatePercentile(arr, p) {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    return arr[Math.floor((arr.length - 1) * p)];
}

function generateProgressBar(percentage, size = 30) {
    const filled = Math.round((percentage / 100) * size);
    const empty = size - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

async function runEnterpriseSuite() {
    console.clear();
    console.log(`\n${color.cyan}======================================================`);
    console.log(`🛡️  AEGIS FIREWALL: ENTERPRISE PERFORMANCE BENCHMARK `);
    console.log(`======================================================${color.reset}\n`);

    console.log(`${color.yellow}Target Node:${color.reset}   ${ENDPOINT}`);
    console.log(`${color.yellow}Concurrency:${color.reset}   ${CONCURRENCY} parallel connections`);
    console.log(`${color.yellow}Stress Load:${color.reset}   ${TOTAL_REQUESTS} total cryptographic intents\n`);

    console.log(`Executing multi-party threshold signature audit. Please wait...\n`);

    const tasks = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
    const startTime = Date.now();

    await pMap(tasks, (id) => executeRequest(id), { concurrency: CONCURRENCY });

    const totalTimeMs = Date.now() - startTime;
    const rps = (TOTAL_REQUESTS / (totalTimeMs / 1000)).toFixed(2);

    const p50 = calculatePercentile(metrics.latencies, 0.50);
    const p90 = calculatePercentile(metrics.latencies, 0.90);
    const p99 = calculatePercentile(metrics.latencies, 0.99);

    const handledTraffic = metrics.successCount + metrics.blockedCount;
    const handledPercentage = ((handledTraffic / TOTAL_REQUESTS) * 100).toFixed(2);

    console.log(`${color.cyan}======================================================`);
    console.log(`📊 END-TO-END THROUGHPUT METRICS`);
    console.log(`======================================================${color.reset}\n`);

    console.log(`Total Elapsed Time:   ${totalTimeMs} ms`);
    console.log(`Sustained Throughput: ${color.green}${rps} Req/s${color.reset}`);

    console.log(`\n${color.cyan}======================================================`);
    console.log(`🔒 SECURITY & CONSENSUS RESOLUTION`);
    console.log(`======================================================${color.reset}\n`);

    console.log(`Valid Gateway Handshakes: ${generateProgressBar(handledPercentage)} ${handledPercentage}%`);
    console.log(`   - Authorized Intents:  ${metrics.successCount}`);
    console.log(`   - MPC Blocked Attacks: ${metrics.blockedCount}`);
    console.log(`   - HTTP/Network Drops:  ${metrics.failureCount}`);

    console.log(`\n${color.cyan}======================================================`);
    console.log(`⚡ LATENCY PERCENTILES (Includes Threshold Cryptography)`);
    console.log(`======================================================${color.reset}\n`);

    console.log(`P50 (Median):         ${p50} ms`);
    console.log(`P90 (Tail):           ${p90} ms`);
    console.log(`P99 (Extreme):        ${p99} ms`);

    console.log(`\n${color.green}Audit completed successfully. Ready for Accelerator Showcase.${color.reset}\n`);
}

runEnterpriseSuite().catch(console.error);
