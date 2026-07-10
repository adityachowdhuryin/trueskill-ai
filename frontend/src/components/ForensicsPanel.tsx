"use client";

import { useState } from "react";
import {
    ShieldCheck, ShieldAlert, ShieldX,
    ChevronDown, AlertTriangle, FileWarning,
} from "lucide-react";
import type { ForensicsData } from "@/types/dashboard";

interface ForensicsPanelProps {
    forensics: ForensicsData;
}

function ScorePill({
    label,
    score,
    positiveThreshold = 80,
    warnThreshold = 60,
}: {
    label: string;
    score: number;
    positiveThreshold?: number;
    warnThreshold?: number;
}) {
    const rounded = Math.round(score);
    const isGood = rounded >= positiveThreshold;
    const isWarn = !isGood && rounded >= warnThreshold;

    const colors = isGood
        ? { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", text: "#059669", num: "#10b981" }
        : isWarn
        ? { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#b45309", num: "#f59e0b" }
        : { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#dc2626", num: "#ef4444" };

    return (
        <div
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl flex-1"
            style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
        >
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: colors.text }}>
                {label}
            </span>
            <span className="text-xl font-black tabular-nums" style={{ color: colors.num }}>
                {rounded}
                <span className="text-sm font-semibold opacity-60">%</span>
            </span>
        </div>
    );
}

export default function ForensicsPanel({ forensics }: ForensicsPanelProps) {
    const [filesOpen, setFilesOpen] = useState(false);

    const verdict = forensics.verdict ?? "Authentic";
    const isAuthentic  = verdict === "Authentic";
    const isSuspicious = verdict === "Suspicious";

    const VerdictIcon = isAuthentic ? ShieldCheck : isSuspicious ? ShieldAlert : ShieldX;
    const verdictStyle = isAuthentic
        ? { bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)", text: "#059669", icon: "#10b981" }
        : isSuspicious
        ? { bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)", text: "#b45309", icon: "#f59e0b" }
        : { bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.2)", text: "#dc2626", icon: "#ef4444" };

    const entropyColor = (e: number) =>
        e < 0.3 ? "#10b981" : e < 0.6 ? "#f59e0b" : "#ef4444";

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ background: verdictStyle.bg, borderBottom: `1px solid ${verdictStyle.border}` }}
            >
                <VerdictIcon className="w-4 h-4 flex-shrink-0" style={{ color: verdictStyle.icon }} />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: verdictStyle.text }}>
                        🔬 Authenticity Analysis
                    </p>
                    <p className="text-[10px]" style={{ color: verdictStyle.text, opacity: 0.75 }}>
                        Stylometric forensics — {verdict}
                    </p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {/* Score pills */}
                <div className="flex gap-2">
                    <ScorePill label="Authenticity" score={forensics.authenticity_score} />
                    <ScorePill label="Consistency" score={forensics.consistency_score} />
                </div>

                {/* File metadata */}
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>
                        <span className="font-bold text-slate-700">{forensics.files_analyzed}</span> files scanned
                    </span>
                    <span className="w-px h-3 bg-slate-200" />
                    <span>
                        <span
                            className="font-bold"
                            style={{ color: forensics.files_with_issues > 0 ? "#ef4444" : "#10b981" }}
                        >
                            {forensics.files_with_issues}
                        </span>{" "}
                        flagged
                    </span>
                </div>

                {/* Bulk commit banner */}
                {forensics.has_bulk_commits && (
                    <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{
                            background: "rgba(245,158,11,0.08)",
                            border: "1px solid rgba(245,158,11,0.25)",
                            color: "#92400e",
                        }}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
                        Large code dump detected in commit history
                    </div>
                )}

                {/* Warnings */}
                {forensics.warnings?.length > 0 && (
                    <div className="space-y-1.5">
                        {forensics.warnings.map((w, i) => (
                            <div
                                key={i}
                                className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                                style={{
                                    background: "rgba(245,158,11,0.05)",
                                    border: "1px solid rgba(245,158,11,0.18)",
                                    color: "#78350f",
                                }}
                            >
                                <span className="flex-shrink-0 mt-0.5">⚠️</span>
                                <span className="leading-relaxed">{w}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Suspicious files accordion */}
                {forensics.suspicious_files?.length > 0 && (
                    <div>
                        <button
                            onClick={() => setFilesOpen(v => !v)}
                            className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1"
                        >
                            <span className="flex items-center gap-1.5">
                                <FileWarning className="w-3.5 h-3.5" />
                                {forensics.suspicious_files.length} suspicious file{forensics.suspicious_files.length !== 1 ? "s" : ""}
                            </span>
                            <ChevronDown
                                className="w-3.5 h-3.5 transition-transform duration-200"
                                style={{ transform: filesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                            />
                        </button>

                        {filesOpen && (
                            <div className="mt-2 space-y-2">
                                {forensics.suspicious_files.map((f, i) => (
                                    <div
                                        key={i}
                                        className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 space-y-1.5"
                                    >
                                        {/* File path */}
                                        <p className="text-[10px] font-mono text-slate-600 truncate" title={f.path}>
                                            {f.path}
                                        </p>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Entropy badge */}
                                            <span
                                                className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                                                style={{
                                                    background: `${entropyColor(f.entropy)}18`,
                                                    border: `1px solid ${entropyColor(f.entropy)}40`,
                                                    color: entropyColor(f.entropy),
                                                }}
                                            >
                                                entropy {f.entropy.toFixed(2)}
                                            </span>

                                            {/* Dominant style */}
                                            {f.dominant_style && f.dominant_style !== "unknown" && (
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                    {f.dominant_style}
                                                </span>
                                            )}
                                        </div>

                                        {/* Flags */}
                                        {f.flags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {f.flags.map((flag, j) => (
                                                    <span
                                                        key={j}
                                                        className="px-1.5 py-0.5 text-[9px] font-medium rounded"
                                                        style={{
                                                            background: "rgba(239,68,68,0.08)",
                                                            border: "1px solid rgba(239,68,68,0.2)",
                                                            color: "#dc2626",
                                                        }}
                                                    >
                                                        {flag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
