import axios from 'axios';
import pMap from 'p-map';

const ENDPOINT = 'http://localhost:8081/v1/execute';
const CONCURRENCY = 10;
const TOTAL_REQUESTS = 50;

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
    failureCount: 0,
    totalLatency: 0,
    latencies: []
};

function handleSuccess(latency) {
    metrics.successCount++;
    metrics.latencies.push(latency);
    metrics.totalLatency += latency;
}

function handleFailure(taskId, errorMsg) {
    metrics.failureCount++;
    console.error(`[Task ${taskId}] Request Failed: ${errorMsg}`);
}

async function executeRequest() {
    try {
        return await axios.post(ENDPOINT, payload, { headers, timeout: 5000 });
    } catch (error) {
        return error;
    }
}

function processSuccessfulBlock(reqStart) {
    handleSuccess(Date.now() - reqStart);
}

function handleNetworkError(error, reqStart, taskId) {
    if (error.response?.status === 403) return processSuccessfulBlock(reqStart);
    handleFailure(taskId, error.message);
}

function processSuccess(reqStart) {
    return processSuccessfulBlock(reqStart);
}

function checkStatus(status, reqStart, taskId) {
    if (status === 'success') return processSuccess(reqStart);
    if (status === 'rejected') return processSuccess(reqStart);
    handleFailure(taskId, "API Payload execution failed internally");
}

function evaluateResponse(res, reqStart, taskId) {
    if (res.data) return checkStatus(res.data.status, reqStart, taskId);
    handleFailure(taskId, "API Payload execution failed internally");
}

function processTaskResponse(res, reqStart, taskId) {
    if (res instanceof Error) return handleNetworkError(res, reqStart, taskId);
    evaluateResponse(res, reqStart, taskId);
}

async function processTask(taskId) {
    const reqStart = Date.now();
    const res = await executeRequest();
    processTaskResponse(res, reqStart, taskId);
}

function getSafeMetric(val) {
    if (val === undefined) return 0;
    return val;
}

function logLatencies(p50, p90, p99) {
    console.log(`P50 (Median): ${p50}ms | P90: ${p90}ms | P99: ${p99}ms`);
}

function printLatencies() {
    if (metrics.latencies.length === 0) {
        console.log(`No successful actions measured.`);
        return;
    }
    metrics.latencies.sort((a, b) => a - b);

    const p50Raw = metrics.latencies[Math.floor(metrics.latencies.length * 0.5)];
    const p90Raw = metrics.latencies[Math.floor(metrics.latencies.length * 0.9)];
    const p99Raw = metrics.latencies[Math.floor(metrics.latencies.length * 0.99)];

    logLatencies(
        getSafeMetric(p50Raw),
        getSafeMetric(p90Raw),
        getSafeMetric(p99Raw)
    );
}

function calculateMetrics(totalTime) {
    const rps = (TOTAL_REQUESTS / (totalTime / 1000)).toFixed(2);

    console.log(`\n📊 Benchmark Results:`);
    console.log(`Total Time: ${totalTime}ms | Throughput: ${rps} Req/s`);
    console.log(`Valid Firewall Defenses: ${((metrics.successCount / TOTAL_REQUESTS) * 100).toFixed(2)}%`);

    printLatencies();
}

async function runBenchmark() {
    console.log(`🚀 Starting Aegis V2 Benchmarks\nTarget: ${ENDPOINT}`);
    const tasks = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
    const startTime = Date.now();

    await pMap(tasks, processTask, { concurrency: CONCURRENCY });

    calculateMetrics(Date.now() - startTime);
}

runBenchmark().catch(console.error);
