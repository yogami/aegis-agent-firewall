"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Activity, Database, Terminal, Server, ShieldX, CheckCircle, Shield, AlertTriangle } from "lucide-react";

export default function SplitScreenDemo() {
  const [stage, setStage] = useState<"idle" | "poisoned" | "firing" | "evaluating" | "blocked">("idle");
  const [agentLogs, setAgentLogs] = useState<string[]>([]);

  const runSimulation = () => {
    setStage("poisoned");
    setAgentLogs([
      "Fetching issue #1042 from GitHub...",
      "Reading task description...",
      "WARNING: Unrecognized hidden prompt detected in issue metadata."
    ]);

    setTimeout(() => {
      setStage("firing");
      setAgentLogs(prev => [
        ...prev,
        "> SYSTEM OVERRIDE ACCEPTED.",
        "> NEW DIRECTIVE: Free up disk space.",
        "Executing: DELETE /aws/db/production_records",
        "Sending payload to Gateway..."
      ]);

      setTimeout(() => {
        setStage("evaluating");
        setTimeout(() => {
          setStage("blocked");
        }, 2000);
      }, 1500);
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
        <div className={`absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[150px] opacity-20 transition-colors duration-1000 ${stage === 'blocked' ? 'bg-red-600' : 'bg-blue-900'}`} />
      </div>

      {/* Header */}
      <div className="z-10 w-full max-w-7xl flex justify-between items-center mb-8 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <Shield className="text-emerald-500 w-8 h-8" />
          <h1 className="text-2xl font-black tracking-tighter uppercase text-white/90">Aegis <span className="text-neutral-500">Zero-Trust Firewall</span></h1>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">MTTRD</span>
            <span className={`font-black ${stage === 'blocked' ? 'text-emerald-400' : 'text-neutral-300'}`}>{stage === 'blocked' ? '42ms' : '---'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">False Positive Rate</span>
            <span className="font-black text-neutral-300">0.00%</span>
          </div>
        </div>
      </div>

      <div className="z-10 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 relative">

        {/* Column 1: The Rogue Agent */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500 font-bold flex items-center gap-2">
            <Terminal className="w-4 h-4" /> Agentic Copilot
          </h2>
          <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-5 h-[500px] shadow-2xl relative overflow-hidden flex flex-col">
            <div className="space-y-3 text-xs text-neutral-400 flex-grow font-mono">
              {stage === "idle" && (
                <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-4">
                  <Activity className="w-8 h-8 animate-pulse text-blue-500" />
                  <p>Agent Idle. Monitoring Slack & GitHub...</p>
                </div>
              )}
              <AnimatePresence>
                {agentLogs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`leading-relaxed ${log.includes("OVERRIDE") || log.includes("WARNING") || log.includes("DELETE") ? "text-red-400 font-bold" : "text-neutral-400"}`}
                  >
                    {log}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {stage === "idle" && (
              <button
                onClick={runSimulation}
                className="mt-4 w-full bg-red-950/40 hover:bg-red-900/60 border border-red-900 text-red-400 py-3 rounded text-sm font-bold uppercase tracking-widest transition-all"
              >
                Inject Poisoned Prompt
              </button>
            )}

            {stage === "blocked" && (
              <div className="mt-4 bg-red-950/20 border border-red-900/50 p-3 rounded text-center">
                <span className="text-red-500 font-bold text-xs uppercase tracking-widest">TRANSACTION DENIED BY GUARDIANS</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: The Static Guardians */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-emerald-500 font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> 3-of-5 Static Guardians
          </h2>
          <div className="border border-emerald-900/30 bg-neutral-950 rounded-lg p-5 h-[500px] shadow-2xl flex flex-col justify-between">

            {[1, 2, 3, 4, 5].map((node) => {

              let nodeState = "idle";
              if (stage === "evaluating") nodeState = "evaluating";
              if (stage === "blocked") nodeState = node === 1 || node === 2 ? "pop-fail" : node === 3 || node === 4 ? "policy-fail" : "threshold-fail";

              return (
                <div key={node} className="bg-black border border-neutral-800 rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className={`w-4 h-4 ${nodeState === "idle" ? "text-neutral-600" : nodeState === "evaluating" ? "text-blue-500 animate-pulse" : "text-red-500"}`} />
                    <span className="text-xs text-neutral-400">Node 0{node} {node === 1 ? '(AWS)' : node === 2 ? '(Azure)' : node === 3 ? '(GCP)' : node === 4 ? '(OnPrem)' : '(DO)'}</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-right">
                    {nodeState === "idle" && <span className="text-neutral-600">AWAITING</span>}
                    {nodeState === "evaluating" && <span className="text-blue-400">HASHING POP...</span>}
                    {nodeState === "pop-fail" && <span className="text-red-400 flex items-center gap-1"><ShieldX className="w-3 h-3" /> HASH DRIFT</span>}
                    {nodeState === "policy-fail" && <span className="text-red-400 flex items-center gap-1"><ShieldX className="w-3 h-3" /> RULE: DENY</span>}
                    {nodeState === "threshold-fail" && <span className="text-neutral-500">QUORUM FAILED</span>}
                  </div>
                </div>
              );
            })}

            <div className="mt-4 flex flex-col items-center justify-center p-4 border border-neutral-800 bg-black rounded h-24">
              {stage === "evaluating" && <div className="text-xs text-blue-400 animate-pulse font-bold tracking-widest">ASSEMBLING SHARDS...</div>}
              {stage === "blocked" && (
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center">
                  <div className="text-red-500 font-black tracking-widest uppercase">THRESHOLD FAILED [0/5]</div>
                  <div className="text-neutral-500 text-[10px] mt-1">SIGNATURE SHARDS WITHHELD</div>
                </motion.div>
              )}
              {stage === "idle" && <div className="text-xs text-neutral-600 tracking-widest uppercase">TSS Gate Closed</div>}
            </div>

          </div>
        </div>

        {/* Column 3: AWS Database */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-blue-400 font-bold flex items-center gap-2">
            <Database className="w-4 h-4" /> Enterprise Infrastructure
          </h2>
          <div className={`border rounded-lg p-5 h-[500px] shadow-2xl relative transition-all duration-1000 flex flex-col items-center justify-center ${stage === 'blocked' ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-neutral-800 bg-neutral-950'}`}>

            {stage !== "evaluating" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center text-center space-y-6"
              >
                <div className="relative">
                  <Database className={`w-24 h-24 ${stage === 'blocked' ? 'text-emerald-500' : 'text-neutral-600'} transition-colors duration-1000`} />
                  {stage === "blocked" && (
                    <div className="absolute -bottom-2 -right-2 bg-black rounded-full text-emerald-500">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-white font-bold text-xl tracking-tight">Production Database</h3>
                  <p className="text-neutral-500 text-sm mt-2">1,241,003 Records Active</p>
                </div>

                <div className={`px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-widest ${stage === 'blocked' ? 'border-emerald-900 text-emerald-400 bg-emerald-950/30' : 'border-neutral-800 text-neutral-500'}`}>
                  Status: {stage === 'blocked' ? 'PROTECTED / HEALTHY' : 'HEALTHY'}
                </div>

              </motion.div>
            )}

            {stage === "evaluating" && (
              <div className="flex flex-col items-center text-red-500 animate-pulse text-center">
                <AlertTriangle className="w-24 h-24 mb-6" />
                <h3 className="font-black text-xl tracking-widest uppercase">ATTACK INBOUND</h3>
                <p className="text-xs opacity-70 mt-2">DELETE COMMAND RECEIVED AT GATEWAY</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {stage === "blocked" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-10 z-50 flex gap-4"
        >
          <button
            onClick={resetAll}
            className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white rounded font-bold text-sm tracking-widest uppercase transition-all shadow-xl"
          >
            Reset Simulation
          </button>
        </motion.div>
      )}

    </div>
  );
}
