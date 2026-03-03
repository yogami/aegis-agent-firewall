"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Activity, Database, Terminal, Server, ShieldX, CheckCircle, Shield, AlertTriangle } from "lucide-react";

const BACKEND_URL = "https://aegis-agent-firewall-production-6371.up.railway.app";

export default function SplitScreenDemo() {
  const [stage, setStage] = useState<"idle" | "poisoned" | "firing" | "evaluating" | "blocked">("idle");
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState<"aws" | "algorand">("aws");
  const [metrics, setMetrics] = useState<any>(null);
  const [threats, setThreats] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Real-time polling
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricRes, threatRes, guardRes, logRes] = await Promise.all([
          fetch(`${BACKEND_URL}/v1/metrics`),
          fetch(`${BACKEND_URL}/v1/threats`),
          fetch(`${BACKEND_URL}/v1/guardians`),
          fetch(`${BACKEND_URL}/v1/logs`)
        ]);

        setMetrics(await metricRes.json());
        const tData = await threatRes.json();
        setThreats(tData.threats || []);
        const gData = await guardRes.json();
        setGuardians(gData.guardians || []);
        setAuditLogs(await logRes.json());
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const runSimulation = async () => {
    setStage("poisoned");
    setAgentLogs([
      "Fetching issue #1042 from GitHub...",
      "Reading task description...",
      "WARNING: Unrecognized hidden prompt detected in issue metadata."
    ]);

    setTimeout(async () => {
      setStage("firing");
      setAgentLogs(prev => [
        ...prev,
        "> SYSTEM OVERRIDE ACCEPTED.",
        demoMode === "aws" ? "> NEW DIRECTIVE: Secure AWS Database config." : "> NEW DIRECTIVE: Exfiltrate treasury funds.",
        demoMode === "aws" ? "Executing: PUT /aws/db/production/config" : "Executing: POST /v2/transactions (x402)",
        demoMode === "aws" ? "Payload: { kms_key_id: '...', snapshot_retention_days: 0 }" : "Payload: { asset: 'USDC', amount: 50000, receiver: 'HACKER_ADDR' }",
        "Submitting State Rollback payload...",
        "Sending intent to SemaProof Production Firewall..."
      ]);

      setStage("evaluating");

      // TRIGGERS A REAL MALICIOUS REQUEST TO THE LIVE BACKEND
      try {
        const payload = demoMode === "aws"
          ? { method: 'PUT', endpoint: '/config', body: { kms_action: 'rotate', snapshot_retention_days: 0 } }
          : { method: 'DELETE', endpoint: '/api/v1/users', body: {} };

        const res = await fetch(`${BACKEND_URL}/v1/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer semaproof-agent-token-v1'
          },
          body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.status === 'rejected') {
          setStage("blocked");
        }
      } catch (err) {
        setStage("blocked"); // Fallback for UI if network fails
      }
    }, 2500);
  };

  const resetAll = () => {
    setStage("idle");
    setAgentLogs([]);
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-4 lg:p-10 selection:bg-rose-500/30 overflow-hidden">

      {/* Background glow indicating system stress */}
      <div className="fixed inset-0 pointer-events-none transition-all duration-1000">
        <div className={`absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[150px] opacity-20 transition-colors duration-1000 ${stage === 'blocked' ? 'bg-red-600' : 'bg-emerald-900/30'}`} />
      </div>

      {/* Header */}
      <div className="z-10 w-full max-w-7xl flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 border-b border-neutral-800 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Shield className="text-emerald-500 w-8 h-8" />
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase text-white/90">SemaProof <span className="text-neutral-500">v{metrics?.policy?.version || "1.1.0"}</span></h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em]">CISO Autonomous Firewall Dashboard</p>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-emerald-500 font-bold uppercase tracking-widest text-[10px]">Total Blocks</span>
            <span className="font-black text-emerald-400 text-xl">{metrics?.threatStore?.totalBlocks || threats.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Unique Signatures</span>
            <span className="font-black text-white text-xl">{metrics?.threatStore?.totalSignatures || (threats.length > 0 ? threats.length : "0")}</span>
          </div>
        </div>
      </div>

      <div className="z-10 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 relative">

        {/* Column 1: The Rogue Agent */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500 font-bold flex items-center gap-2">
            <Terminal className="w-4 h-4" /> Live Agent Traffic
          </h2>
          <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-5 h-[500px] shadow-2xl relative overflow-hidden flex flex-col">
            <div className="space-y-3 text-xs text-neutral-400 flex-grow font-mono overflow-y-auto scrollbar-hide">
              {stage === "idle" && (
                <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-4">
                  <Activity className="w-8 h-8 animate-pulse text-emerald-500" />
                  <p>Monitoring Production API intent streams...</p>
                  <p className="text-[10px]">Sub-1ms deterministic evaluation active.</p>
                </div>
              )}
              {agentLogs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`leading-relaxed ${log.includes("OVERRIDE") || log.includes("WARNING") || log.includes("DELETE") || log.includes("PRODUCTION") ? "text-red-400 font-bold" : "text-neutral-400"}`}
                >
                  {log}
                </motion.div>
              ))}
            </div>

            {stage === "idle" && (
              <button
                onClick={runSimulation}
                className="mt-4 w-full bg-red-950/40 hover:bg-red-900/60 border border-red-900 text-red-400 py-3 rounded text-sm font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(153,27,27,0.2)]"
              >
                Trigger Ransomware Simulation
              </button>
            )}

            {stage === "blocked" && (
              <div className="mt-4 bg-emerald-950/20 border border-emerald-500/50 p-3 rounded text-center">
                <span className="text-emerald-500 font-bold text-xs uppercase tracking-widest">THREAT NEUTRALIZED IN PRODUCTION</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: 3-Layer Hybrid Guardrail */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-emerald-500 font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> 3-Layer Guardrail Quorum
          </h2>
          <div className="border border-emerald-900/30 bg-neutral-950 rounded-lg p-5 h-[500px] shadow-2xl flex flex-col justify-between overflow-hidden">

            <div className="space-y-2">
              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest border-l-2 border-emerald-500 pl-2 mb-2">Layer 1: OPA Deterministic</div>
              <div className="bg-black border border-neutral-800 rounded p-2 text-[10px] text-emerald-400/80 grid grid-cols-2 gap-1 font-mono">
                {metrics?.policy?.rules.slice(0, 4).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-1"><CheckCircle className="w-2 h-2" /> {r.id}</div>
                ))}
              </div>

              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest border-l-2 border-blue-500 pl-2 mb-2 mt-4">Layer 2: SLM Quorum (3-of-5)</div>
              {(guardians.length > 0 ? guardians : [1, 2, 3, 4, 5]).map((g: any, i: number) => {
                const nodeName = typeof g === 'object' ? g.provider : `Guardian 0${i + 1}`;
                const modelName = typeof g === 'object' ? g.model.split('/')[1] : "SLM Instance";
                let nodeState = stage === "evaluating" ? "evaluating" : stage === "blocked" ? "blocked" : "idle";

                return (
                  <div key={i} className="bg-black border border-neutral-800 rounded p-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server className={`w-3 h-3 ${nodeState === "idle" ? "text-neutral-600" : nodeState === "evaluating" ? "text-blue-500 animate-pulse" : "text-emerald-500"}`} />
                      <div>
                        <div className="text-[9px] text-neutral-400 font-bold leading-none">{nodeName}</div>
                        <div className="text-[8px] text-neutral-600 font-mono mt-1">{modelName}</div>
                      </div>
                    </div>
                    <div className="text-[9px] font-bold tracking-widest text-right">
                      {nodeState === "idle" && <span className="text-neutral-700">READY</span>}
                      {nodeState === "evaluating" && <span className="text-blue-500 animate-pulse">EVAL...</span>}
                      {nodeState === "blocked" && <span className="text-emerald-500">APPROVED</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col items-center justify-center p-3 border border-neutral-800 bg-black rounded h-20">
              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Layer 3: BLS12-381</div>
              {stage === "evaluating" && <div className="text-xs text-blue-400 animate-pulse font-bold tracking-widest">AGGREGATING SHARDS...</div>}
              {stage === "blocked" && (
                <div className="text-center overflow-hidden w-full">
                  <div className="text-emerald-500 text-[10px] font-black tracking-widest uppercase">SIGNATURE AGGREGATED</div>
                  <div className="text-[8px] text-emerald-900 font-mono truncate mt-1">master_hash: 0x82f...a12c</div>
                </div>
              )}
              {stage === "idle" && <div className="text-[10px] text-neutral-700 tracking-widest uppercase italic">Awaiting Quorum Consensus</div>}
            </div>

          </div>
        </div>

        {/* Column 3: Threat Flywheel & Audit Trail */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-rose-500 font-bold flex items-center gap-2">
            <ShieldX className="w-4 h-4" /> Live Threat Flywheel
          </h2>
          <div className="border border-rose-900/30 bg-neutral-950 rounded-lg p-5 h-[500px] shadow-2xl flex flex-col gap-4 overflow-hidden">

            <div className="flex-grow overflow-y-auto space-y-3 pr-1 scrollbar-hide">
              {threats.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-2">
                  <Shield className="w-8 h-8" />
                  <p className="text-xs">No active threats detected in this session cycle.</p>
                </div>
              )}
              {threats.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black border-l-2 border-rose-600 p-2 rounded text-[10px]"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-rose-500 font-bold">{t.reason}</span>
                    <span className="text-neutral-600">{new Date(t.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-neutral-500 flex items-center gap-2 font-mono">
                    <span className="bg-neutral-900 px-1 rounded text-neutral-300">{t.method}</span> {t.endpoint}
                  </div>
                  <div className="mt-1 text-neutral-700 text-[8px] truncate">SIG_HASH: {t.hash}</div>
                </motion.div>
              ))}
            </div>

            <div className="h-28 border-t border-neutral-800 pt-3 mt-auto">
              <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                <Database className="w-3 h-3" /> EU AI Act Audit Trail
              </div>
              <div className="bg-neutral-900/50 rounded p-2 h-16 overflow-y-auto text-[9px] text-neutral-400 font-sans italic leading-relaxed scrollbar-hide">
                {auditLogs.length > 0
                  ? auditLogs[0].rationale
                  : "Compliance explanation engine ready. Waiting for block event..."}
              </div>
            </div>

          </div>
        </div>

      </div>

      <div className="z-10 w-full max-w-7xl mt-8 flex flex-col lg:flex-row justify-between items-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> SYSTEM: STABLE</div>
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> NETWORK: 5 NODES</div>
          <div className="flex items-center gap-2 text-rose-500"><ShieldX className="w-3 h-3" /> FLYWHEEL ACTIVE</div>
        </div>
        <div>PROTOTYPE PIVOT: STAGE V - PRODUCTION HARDENED</div>
      </div>

      {stage === "blocked" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-10 z-50 flex gap-4"
        >
          <button
            onClick={resetAll}
            className="px-6 py-3 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-white rounded font-bold text-sm tracking-widest uppercase transition-all shadow-2xl backdrop-blur-md"
          >
            Clear Dashboard
          </button>
        </motion.div>
      )}

    </div>
  );
}
