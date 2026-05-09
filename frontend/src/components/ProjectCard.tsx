"use client";

import React, { useState } from "react";
import {
    CheckCircle,
    XCircle,
    AlertCircle,
    Clock,
    ChevronDown,
    ChevronUp,
    GitBranch,
    Cpu,
    BarChart2,
    Layers,
    ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TechCoverageItem {
    tech: string;
    found: boolean;
    evidence_node_ids: string[];
}

export interface BulletVerdict {
    claim: string;
    supported: boolean;
    evidence_nodes: string[];
}

export interface ProjectVerificationResult {
    project_id: string;
    name: string;
    tech_stack: string[];
    status: "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested";
    overall_score: number;
    matched_repo_id: string;
    matched_repo_name: string;
    tech_coverage: TechCoverageItem[];
    tech_coverage_score: number;
    architecture_score: number;
    claim_support_score: number;
    reasoning: string;
    bullet_verdicts: BulletVerdict[];
}

interface ProjectCardProps {
    result: ProjectVerificationResult;
    index: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    "Verified": {
        bg:     "bg-emerald-50",
        border: "border-emerald-200",
        text:   "text-emerald-700",
        badge:  "bg-emerald-100 text-emerald-700 border-emerald-200",
        dot:    "bg-emerald-500",
        icon:   <CheckCircle className="w-4 h-4" />,
        scoreColor: "#10b981",
    },
    "Partially Verified": {
        bg:     "bg-amber-50",
        border: "border-amber-200",
        text:   "text-amber-700",
        badge:  "bg-amber-100 text-amber-700 border-amber-200",
        dot:    "bg-amber-400",
        icon:   <AlertCircle className="w-4 h-4" />,
        scoreColor: "#f59e0b",
    },
    "Unverified": {
        bg:     "bg-red-50",
        border: "border-red-200",
        text:   "text-red-700",
        badge:  "bg-red-100 text-red-700 border-red-200",
        dot:    "bg-red-400",
        icon:   <XCircle className="w-4 h-4" />,
        scoreColor: "#ef4444",
    },
    "Repo Not Ingested": {
        bg:     "bg-slate-50",
        border: "border-slate-200",
        text:   "text-slate-500",
        badge:  "bg-slate-100 text-slate-500 border-slate-200",
        dot:    "bg-slate-400",
        icon:   <Clock className="w-4 h-4" />,
        scoreColor: "#94a3b8",
    },
} as const;

function ScoreBar({
    label,
    value,
    max,
    color,
    delay = 0,
}: {
    label: string;
    value: number;
    max: number;
    color: string;
    delay?: number;
}) {
    const pct = Math.round((value / max) * 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-[11px] font-medium text-slate-600">{label}</span>
                <span className="text-[11px] font-semibold text-slate-700">
                    {value}/{max}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        transitionDelay: `${delay}ms`,
                    }}
                />
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectCard({ result, index }: ProjectCardProps) {
    const [expanded, setExpanded] = useState(false);
    const cfg = STATUS_CONFIG[result.status];
    const isNotIngested = result.status === "Repo Not Ingested";

    const foundCount   = result.tech_coverage.filter(t => t.found).length;
    const totalTechs   = result.tech_coverage.length;

    return (
        <div
            className={`rounded-2xl border shadow-sm transition-all duration-300 overflow-hidden animate-slide-in-left`}
            style={{ animationDelay: `${index * 60}ms` }}
        >
            {/* ── Header ── */}
            <button
                onClick={() => setExpanded(v => !v)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-colors hover:bg-slate-50/70 ${cfg.bg} ${cfg.border} border-b`}
            >
                {/* Status icon + score ring */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                    <div className={`${cfg.text}`}>{cfg.icon}</div>
                    {!isNotIngested && (
                        <span
                            className="text-[10px] font-bold tabular-nums"
                            style={{ color: cfg.scoreColor }}
                        >
                            {result.overall_score}
                        </span>
                    )}
                </div>

                {/* Project name + meta */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">
                            {result.name}
                        </h3>
                        <span
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${cfg.badge}`}
                        >
                            {result.status}
                        </span>
                    </div>

                    {/* Matched repo */}
                    {!isNotIngested && result.matched_repo_name && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <GitBranch className="w-3 h-3 text-slate-400" />
                            <span className="text-[11px] text-slate-500">
                                Matched: <span className="font-medium text-slate-700">{result.matched_repo_name}</span>
                            </span>
                        </div>
                    )}
                    {isNotIngested && (
                        <p className="text-[11px] text-slate-500 mt-1">
                            Ingest the project&apos;s GitHub repo to enable verification
                        </p>
                    )}

                    {/* Tech chips — always visible */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.tech_coverage.map(item => (
                            <span
                                key={item.tech}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                    isNotIngested
                                        ? "bg-slate-50 text-slate-500 border-slate-200"
                                        : item.found
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-red-50 text-red-600 border-red-200"
                                }`}
                            >
                                {!isNotIngested && (
                                    item.found
                                        ? <CheckCircle className="w-2.5 h-2.5" />
                                        : <XCircle    className="w-2.5 h-2.5" />
                                )}
                                {item.tech}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Expand chevron */}
                <div className="flex-shrink-0 text-slate-400 pt-0.5">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {/* ── Expanded Body ── */}
            {expanded && (
                <div className="bg-white px-5 py-4 space-y-5">

                    {/* Score Breakdown */}
                    {!isNotIngested && (
                        <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                            <div className="flex items-center gap-2 mb-1">
                                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                                    Score Breakdown
                                </span>
                                <span className="ml-auto text-[11px] font-bold text-slate-700">
                                    {result.overall_score}/100
                                </span>
                            </div>
                            <ScoreBar label="Tech Stack Coverage" value={result.tech_coverage_score} max={40} color="#6366f1" delay={0}   />
                            <ScoreBar label="Architecture Assessment" value={result.architecture_score} max={35} color="#f59e0b" delay={80}  />
                            <ScoreBar label="Claim Support"      value={result.claim_support_score} max={25} color="#8b5cf6" delay={160} />
                        </div>
                    )}

                    {/* Tech Coverage Detail */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                                Tech Stack Coverage
                            </span>
                            {!isNotIngested && (
                                <span className="ml-auto text-[11px] font-medium text-slate-500">
                                    {foundCount}/{totalTechs} found
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {result.tech_coverage.map(item => (
                                <div
                                    key={item.tech}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                                        isNotIngested
                                            ? "bg-slate-50 text-slate-500 border-slate-200"
                                            : item.found
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-red-50 text-red-600 border-red-200"
                                    }`}
                                >
                                    {!isNotIngested && (
                                        item.found
                                            ? <CheckCircle className="w-3 h-3 flex-shrink-0" />
                                            : <XCircle    className="w-3 h-3 flex-shrink-0" />
                                    )}
                                    <span className="font-medium">{item.tech}</span>
                                    {item.found && item.evidence_node_ids.length > 0 && (
                                        <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded">
                                            {item.evidence_node_ids.length} node{item.evidence_node_ids.length > 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI Architecture Assessment */}
                    {result.reasoning && (
                        <div className="bg-indigo-50/60 rounded-xl p-3.5 border border-indigo-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">
                                    AI Architecture Assessment
                                </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{result.reasoning}</p>
                        </div>
                    )}

                    {/* Bullet Claim Verdicts */}
                    {result.bullet_verdicts && result.bullet_verdicts.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                                    Claim Verdicts
                                </span>
                                <span className="ml-auto text-[11px] text-slate-500">
                                    {result.bullet_verdicts.filter(v => v.supported).length}/{result.bullet_verdicts.length} supported
                                </span>
                            </div>
                            <div className="space-y-2">
                                {result.bullet_verdicts.map((verdict, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                                            isNotIngested
                                                ? "bg-slate-50 border-slate-100 text-slate-500"
                                                : verdict.supported
                                                    ? "bg-emerald-50/80 border-emerald-100 text-slate-700"
                                                    : "bg-red-50/70 border-red-100 text-slate-600"
                                        }`}
                                    >
                                        <span className="flex-shrink-0 mt-0.5">
                                            {isNotIngested ? (
                                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            ) : verdict.supported ? (
                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                                            )}
                                        </span>
                                        <span className="leading-relaxed">{verdict.claim}</span>
                                        {verdict.evidence_nodes && verdict.evidence_nodes.length > 0 && (
                                            <span className="flex-shrink-0 ml-auto text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                                                {verdict.evidence_nodes.length} node{verdict.evidence_nodes.length > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Repo Not Ingested CTA */}
                    {isNotIngested && (
                        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                            <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-semibold text-amber-800">Repo not yet ingested</p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                    To verify this project, ingest its GitHub repository using the <strong>Ingest Repo</strong> button,
                                    then re-run project verification.
                                </p>
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
